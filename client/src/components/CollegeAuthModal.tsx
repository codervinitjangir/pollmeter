import { useState, useEffect, useRef } from 'react';
import {
  AuthUser,
  fetchCollegeConfig,
  loginWithGoogleCredential,
  loginWithCollegeDemo,
} from '../auth';

interface Props {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: (user: AuthUser) => void;
  onClose?: () => void;
  roleHint?: 'student' | 'mentor';
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function CollegeAuthModal({
  isOpen,
  title = 'Medhavi Skills University',
  subtitle = 'Sign in with your official college email ID to continue',
  onSuccess,
  onClose,
  roleHint = 'student',
}: Props) {
  const [allowedDomains, setAllowedDomains] = useState<string[]>([
    'medhaviskillsuniversity.edu.in',
    'medhaviskillsunivercity.edu.in',
  ]);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [realNameInput, setRealNameInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCollegeConfig().then((cfg) => {
      if (cfg.allowedDomains?.length) setAllowedDomains(cfg.allowedDomains);
      if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
    });
  }, []);

  // Initialize Google GIS if Google Client ID is configured and GIS is loaded
  useEffect(() => {
    if (!isOpen || !googleClientId || !window.google?.accounts?.id || !googleBtnRef.current) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setLoading(true);
          setError('');
          try {
            const data = await loginWithGoogleCredential(response.credential);
            onSuccess(data.user);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        },
        hosted_domain: allowedDomains[0] || 'medhaviskillsuniversity.edu.in',
      });

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        width: 280,
        text: 'signin_with',
      });
    } catch (err) {
      console.warn('[auth] GIS button render warning:', err);
    }
  }, [isOpen, googleClientId, allowedDomains, onSuccess]);

  if (!isOpen) return null;

  async function handleDirectCollegeLogin(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanName = realNameInput.trim();

    if (!cleanEmail) {
      setError('Please enter your college email address.');
      return;
    }

    const domain = cleanEmail.split('@')[1];
    if (!domain || !allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      setError(`Access Restricted: Email must end with @${allowedDomains[0]}`);
      return;
    }

    if (!cleanName) {
      setError('Please enter your full official name.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await loginWithCollegeDemo(cleanEmail, cleanName);
      onSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose ? () => onClose() : undefined}>
      <div className="pm-auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="pm-auth-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}

        <div className="pm-auth-header">
          <div className="pm-auth-badge">
            <span className="pm-auth-badge-icon">🎓</span>
            <span>Medhavi Skills University</span>
          </div>
          <h2 className="pm-auth-title">{title}</h2>
          <p className="pm-auth-subtitle">{subtitle}</p>
        </div>

        {error && (
          <div className="pm-auth-error-alert" role="alert">
            <span className="pm-auth-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Google One-Tap / SSO Button container if configured */}
        {googleClientId && (
          <div className="pm-auth-google-section">
            <div ref={googleBtnRef} className="pm-auth-google-btn-wrapper" />
            <div className="pm-auth-divider">
              <span>or enter details manually</span>
            </div>
          </div>
        )}

        {/* College Email & Official Real Name Form */}
        <form onSubmit={handleDirectCollegeLogin} className="pm-auth-form">
          <div className="pm-auth-field">
            <label htmlFor="college-email-input">Official College Email ID</label>
            <div className="pm-auth-input-wrapper">
              <input
                id="college-email-input"
                type="email"
                placeholder={`e.g. don@${allowedDomains[0]}`}
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setError('');
                }}
                disabled={loading}
                autoFocus
                required
              />
              <span className="pm-auth-input-icon">✉️</span>
            </div>
            <span className="pm-auth-hint">
              Restricted to @{allowedDomains[0]}
            </span>
          </div>

          <div className="pm-auth-field">
            <label htmlFor="official-name-input">Official Real Name (as per college ID)</label>
            <div className="pm-auth-input-wrapper">
              <input
                id="official-name-input"
                type="text"
                placeholder="e.g. Don Sharma"
                value={realNameInput}
                onChange={(e) => {
                  setRealNameInput(e.target.value);
                  setError('');
                }}
                disabled={loading}
                required
              />
              <span className="pm-auth-input-icon">👤</span>
            </div>
            <span className="pm-auth-hint">
              {roleHint === 'mentor'
                ? 'Your verified faculty identity for hosting and grading'
                : 'Mentors will see this in the official attendance & grading report'}
            </span>
          </div>

          <button
            type="submit"
            className="pm-auth-submit-btn"
            disabled={loading}
            id="college-signin-submit-btn"
          >
            {loading ? (
              <span className="pm-auth-spinner">Verifying...</span>
            ) : (
              <span>Sign In with College ID →</span>
            )}
          </button>
        </form>

        <div className="pm-auth-footer">
          <span className="pm-auth-lock-icon">🔒</span>
          <span>Only authorized Medhavi Skills University accounts are permitted.</span>
        </div>
      </div>
    </div>
  );
}
