import { useState, useEffect, useRef } from 'react';
import {
  AuthUser,
  fetchCollegeConfig,
  loginWithGoogleCredential,
  sendCollegeOtp,
  verifyCollegeOtp,
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
  title,
  subtitle,
  onSuccess,
  onClose,
  roleHint = 'student',
}: Props) {
  const [activeTab, setActiveTab] = useState<'google' | 'otp'>('google');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([
    'medhaviskillsuniversity.edu.in',
    'medhaviskillsunivercity.edu.in',
  ]);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  // OTP Form States
  const [emailInput, setEmailInput] = useState('');
  const [realNameInput, setRealNameInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const primaryDomain = allowedDomains[0] || 'medhaviskillsuniversity.edu.in';
  const isFacultyRole = roleHint === 'mentor';
  const activeDomain = isFacultyRole ? 'polariscampus.com' : primaryDomain;

  useEffect(() => {
    fetchCollegeConfig().then((cfg) => {
      if (cfg.allowedDomains?.length) setAllowedDomains(cfg.allowedDomains);
      if (cfg.googleClientId) setGoogleClientId(cfg.googleClientId);
    });
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Initialize Google GIS cleanly without black container artifacts
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
            if (isFacultyRole && !data.user.email.endsWith('@polariscampus.com')) {
              setError('Access Restricted: Faculty & Admin access is strictly limited to @polariscampus.com accounts.');
              return;
            }
            onSuccess(data.user);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        },
        hosted_domain: activeDomain,
      });

      // Clear previous buttons
      googleBtnRef.current.innerHTML = '';

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: 320,
        text: 'continue_with',
        logo_alignment: 'left',
      });
    } catch (err) {
      console.warn('[auth] GIS button render warning:', err);
    }
  }, [isOpen, googleClientId, activeDomain, isFacultyRole, onSuccess, activeTab]);

  if (!isOpen) return null;

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanName = realNameInput.trim();

    if (!cleanEmail) {
      setError('Please enter your college email address.');
      return;
    }

    if (isFacultyRole) {
      if (!cleanEmail.endsWith('@polariscampus.com')) {
        setError('Access Restricted: Faculty and Administrator access strictly requires an @polariscampus.com email.');
        return;
      }
    } else {
      const domain = cleanEmail.split('@')[1];
      if (!domain || !allowedDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        setError(`Access Restricted: Student email must end with @${primaryDomain}`);
        return;
      }
    }

    if (!cleanName) {
      setError('Please enter your full official name as registered with the university.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await sendCollegeOtp(cleanEmail);
      setOtpStep('verify');
      setResendCooldown(45);
      if (res.devCode) {
        setDevCodeHint(res.devCode);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanName = realNameInput.trim();
    const cleanCode = otpCode.trim();

    if (!cleanCode || cleanCode.length < 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await verifyCollegeOtp(cleanEmail, cleanCode, cleanName);
      onSuccess(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const defaultTitle = isFacultyRole ? 'Faculty & Presenter Access' : 'Student Classroom Gateway';
  const defaultSubtitle = isFacultyRole
    ? 'Institutional access strictly restricted to verified @polariscampus.com faculty & administrators.'
    : `Secure institutional authentication restricted to verified @${primaryDomain} members.`;

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose ? () => onClose() : undefined}>
      <div className="pm-auth-modal-card" onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="pm-auth-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}

        {/* Institutional Branding Header */}
        <div className="pm-auth-header">
          <div className="pm-auth-badge">
            <span className="pm-auth-live-dot" />
            <span className="pm-auth-badge-icon">🏛️</span>
            <span>{isFacultyRole ? 'Polaris Campus Verified Faculty & Admin Portal' : 'Medhavi Skills University Verified Portal'}</span>
          </div>
          <h2 className="pm-auth-title">{title || defaultTitle}</h2>
          <p className="pm-auth-subtitle">{subtitle || defaultSubtitle}</p>
        </div>

        {/* Tab Switcher: Google SSO vs Email OTP */}
        <div className="pm-auth-tabs">
          <button
            type="button"
            className={`pm-auth-tab ${activeTab === 'google' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('google');
              setError('');
            }}
          >
            <span className="pm-tab-icon">⚡</span>
            <span>Google SSO</span>
            <span className="pm-tab-badge">Instant</span>
          </button>
          <button
            type="button"
            className={`pm-auth-tab ${activeTab === 'otp' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('otp');
              setError('');
            }}
          >
            <span className="pm-tab-icon">✉️</span>
            <span>Email OTP Code</span>
          </button>
        </div>

        {error && (
          <div className="pm-auth-error-alert" role="alert">
            <span className="pm-auth-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ─── TAB 1: GOOGLE 1-CLICK VERIFICATION ─── */}
        {activeTab === 'google' && (
          <div className="pm-auth-sso-pane">
            <div className="pm-sso-card">
              <div className="pm-sso-icon-bubble">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#EEF2FF" />
                  <path d="M12 7V17M7 12H17" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>

              <h3 className="pm-sso-title">One-Click Institutional Login</h3>
              <p className="pm-sso-desc">
                {isFacultyRole
                  ? 'Sign in with your official @polariscampus.com Google Workspace account. Faculty & admin privileges are automatically verified.'
                  : 'Sign in with your official university Google account. Your student identity will be automatically verified with zero password hassle.'}
              </p>

              <div className="pm-sso-btn-container">
                <div ref={googleBtnRef} className="pm-auth-google-btn-wrapper" />
              </div>

              <div className="pm-sso-features">
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check">✓</span>
                  <span>Instant domain cryptography check</span>
                </div>
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check">✓</span>
                  <span>Official name & email automatically synced</span>
                </div>
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check">✓</span>
                  <span>Eliminates spoofing and proxy attendance</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: EMAIL OTP VERIFICATION ─── */}
        {activeTab === 'otp' && (
          <div className="pm-auth-otp-pane">
            {otpStep === 'request' ? (
              <form onSubmit={handleSendOtp} className="pm-auth-form">
                <div className="pm-auth-field">
                  <label htmlFor="college-email-input">Official College Email Address</label>
                  <div className="pm-auth-input-wrapper">
                    <input
                      id="college-email-input"
                      type="email"
                      placeholder={isFacultyRole ? 'mentor.name@polariscampus.com' : `e.g. don@${primaryDomain}`}
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
                    {isFacultyRole ? 'Must end with @polariscampus.com' : `Must end with @${primaryDomain}`}
                  </span>
                </div>

                <div className="pm-auth-field">
                  <label htmlFor="official-name-input">Official Full Name</label>
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
                      ? 'Appears as faculty host for quiz sessions'
                      : 'Mentors will see this on attendance and grade sheets'}
                  </span>
                </div>

                <button type="submit" className="pm-auth-submit-btn" disabled={loading}>
                  {loading ? 'Sending Code...' : 'Send 6-Digit Verification Code →'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="pm-auth-form">
                <div className="pm-otp-notice">
                  <div className="pm-otp-icon">📬</div>
                  <div>
                    <h4>Check your College Inbox</h4>
                    <p>
                      We sent a 6-digit verification code to <strong>{emailInput}</strong>
                    </p>
                  </div>
                </div>

                {devCodeHint && (
                  <div className="pm-dev-code-banner" onClick={() => setOtpCode(devCodeHint)}>
                    <span className="pm-dev-tag">⚡ DEV / QUICK CODE</span>
                    <span>
                      Click to autofill: <strong>{devCodeHint}</strong>
                    </span>
                  </div>
                )}

                <div className="pm-auth-field">
                  <label htmlFor="otp-code-input">Enter 6-Digit Code</label>
                  <div className="pm-auth-input-wrapper">
                    <input
                      id="otp-code-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="• • • • • •"
                      className="pm-otp-input"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, ''));
                        setError('');
                      }}
                      disabled={loading}
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="pm-otp-actions">
                  <button
                    type="button"
                    className="pm-btn-text"
                    onClick={() => {
                      setOtpStep('request');
                      setOtpCode('');
                      setError('');
                    }}
                    disabled={loading}
                  >
                    ← Change Email
                  </button>

                  <button
                    type="button"
                    className="pm-btn-text"
                    disabled={resendCooldown > 0 || loading}
                    onClick={handleSendOtp}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                  </button>
                </div>

                <button type="submit" className="pm-auth-submit-btn" disabled={loading || otpCode.length < 6}>
                  {loading ? 'Verifying Code...' : 'Verify Code & Sign In →'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Security Trust Seal */}
        <div className="pm-auth-footer">
          <span className="pm-auth-lock-icon">🔒</span>
          <span>
            {isFacultyRole
              ? 'End-to-End Institutional Security • Polaris Campus Verified'
              : 'End-to-End Institutional Security • Medhavi EduCloud Verified'}
          </span>
        </div>
      </div>
    </div>
  );
}
