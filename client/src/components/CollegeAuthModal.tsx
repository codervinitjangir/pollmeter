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
    'polariscampus.com',
    'medhaviskillsuniversity.edu.in',
    'medhaviskillsunivercity.edu.in',
  ]);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

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

  const primaryDomain = allowedDomains[0] || 'polariscampus.com';
  const isFacultyRole = roleHint === 'mentor';
  const activeDomain = isFacultyRole ? 'polariscampus.com' : primaryDomain;

  // Sync theme changes dynamically
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      const t = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
      setCurrentTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

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

  // Initialize Google GIS cleanly matching the current theme
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
        theme: currentTheme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        width: 320,
        text: 'continue_with',
        logo_alignment: 'left',
      });
    } catch (err) {
      console.warn('[auth] GIS button render warning:', err);
    }
  }, [isOpen, googleClientId, activeDomain, isFacultyRole, onSuccess, activeTab, currentTheme]);

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

  const defaultTitle = isFacultyRole ? 'University Faculty & Admin Access' : 'Student Classroom Login';

  return (
    <div className="pm-auth-modal-backdrop" onClick={onClose ? () => onClose() : undefined}>
      <div
        className={`pm-auth-modal-card ${
          isFacultyRole ? 'pm-auth-modal-card-faculty' : 'pm-auth-modal-card-student'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button className="pm-auth-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        {/* Institutional Branding Header */}
        <div className="pm-auth-header">
          <div className={`pm-auth-badge ${isFacultyRole ? 'pm-auth-badge-faculty' : 'pm-auth-badge-student'}`}>
            <span className="pm-auth-live-dot" />
            <span className="pm-auth-badge-icon">🏛️</span>
            <span>
              {isFacultyRole
                ? 'Polaris Campus Verified Faculty & Admin Portal'
                : 'Polaris Campus Verified Student Portal'}
            </span>
          </div>
          <h2 className="pm-auth-title">{title || defaultTitle}</h2>
          <p className="pm-auth-subtitle">
            Access restricted to verified{' '}
            <span className={`pm-auth-domain-chip ${isFacultyRole ? 'pm-auth-domain-chip-faculty' : 'pm-auth-domain-chip-student'}`}>
              {isFacultyRole ? '@polariscampus.com' : `@${primaryDomain}`}
            </span>{' '}
            {isFacultyRole ? 'faculty & administrators' : 'university members'}
          </p>
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
              {isFacultyRole ? (
                <div className="pm-sso-icon-bubble pm-sso-icon-bubble-faculty">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 11V15M10 13H14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="8.5" r="1.5" fill="currentColor" />
                  </svg>
                </div>
              ) : (
                <div className="pm-sso-icon-bubble pm-sso-icon-bubble-student">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3L2 8L12 13L22 8L12 3Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 10.5V16C6 18 8.69 20 12 20C15.31 20 18 18 18 16V10.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 8V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              <h3 className="pm-sso-title">One-Click Institutional Login</h3>
              <p className="pm-sso-desc">
                {isFacultyRole
                  ? 'Sign in with your official @polariscampus.com Google Workspace account. Faculty & admin privileges are automatically verified.'
                  : 'Sign in with your official university Google account. Your student identity will be automatically verified with zero password hassle.'}
              </p>

              <div className="pm-sso-btn-container">
                <div ref={googleBtnRef} className="pm-auth-google-btn-wrapper" />
                {(!googleClientId || !window.google?.accounts?.id) && (
                  <button
                    type="button"
                    className="pm-google-fallback-btn"
                    onClick={() => setActiveTab('otp')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Continue with Google Workspace</span>
                  </button>
                )}
              </div>

              <div className="pm-sso-features">
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check-bubble">✓</span>
                  <span>Instant domain cryptography check</span>
                </div>
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check-bubble">✓</span>
                  <span>Official name &amp; email automatically synced</span>
                </div>
                <div className="pm-sso-feature-item">
                  <span className="pm-feat-check-bubble">✓</span>
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

                <button
                  type="submit"
                  className={isFacultyRole ? 'pm-btn-faculty-primary' : 'pm-auth-submit-btn'}
                  disabled={loading}
                  style={{ width: '100%' }}
                >
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

                <button
                  type="submit"
                  className={isFacultyRole ? 'pm-btn-faculty-primary' : 'pm-auth-submit-btn'}
                  disabled={loading || otpCode.length < 6}
                  style={{ width: '100%' }}
                >
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
              : 'End-to-End Institutional Security • Polaris EduCloud Verified'}
          </span>
        </div>
      </div>
    </div>
  );
}
