import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveTheme, toggleTheme, Theme } from '../theme';
import { getAuthUser, clearStoredAuth, AuthUser, refreshAuthUser, isFacultyEmail } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';

export default function LandingPage() {
  const navigate = useNavigate();
  const [theme, setCurrentTheme] = useState<Theme>(getActiveTheme());
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRoleHint, setAuthRoleHint] = useState<'student' | 'mentor'>('mentor');

  // Six individual digit refs for PIN
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);

  useEffect(() => {
    refreshAuthUser().then((synced) => {
      if (synced) setAuthUser(synced);
    });
  }, []);

  // Keep body/html theme attribute in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function openSignIn(role: 'student' | 'mentor') {
    setAuthRoleHint(role);
    setShowAuthModal(true);
  }

  /* ─── PIN digit helpers ─────────────────────────────────────────── */
  function handleDigitInput(idx: number, val: string) {
    const clean = val.replace(/\D/g, '');
    const next = [...digits];
    next[idx] = clean.slice(-1);
    setDigits(next);
    if (clean && idx < 5) digitRefs.current[idx + 1]?.focus();
  }

  function handleDigitKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      digitRefs.current[idx - 1]?.focus();
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = [...digits];
    [...text].forEach((c, k) => { next[k] = c; });
    setDigits(next);
    digitRefs.current[Math.min(text.length, 5)]?.focus();
  }

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length === 6) {
      navigate(`/join?code=${code}`);
    } else {
      navigate('/join');
    }
  }

  /* ─── Welcome panel PIN (single input) ─────────────────────────── */
  const [fastCode, setFastCode] = useState('');
  function handleFastJoin(e: React.FormEvent) {
    e.preventDefault();
    const clean = fastCode.trim().replace(/\D/g, '');
    if (clean.length === 6) {
      navigate(`/join?code=${clean}`);
    } else {
      navigate('/join');
    }
  }

  const isFacultyUser = Boolean(
    authUser && (authUser.role === 'mentor' || authUser.role === 'admin' || isFacultyEmail(authUser.email))
  );

  return (
    <div className="lp-root" id="top">
      {/* Auth Modal */}
      <CollegeAuthModal
        isOpen={showAuthModal}
        title={authRoleHint === 'mentor' ? 'University Faculty & Admin Access' : 'Medhavi Student Login'}
        subtitle={
          authRoleHint === 'mentor'
            ? 'Access restricted to verified @polariscampus.com faculty & administrators'
            : 'Sign in with your official @medhaviskillsuniversity.edu.in student account'
        }
        onSuccess={(u) => {
          setAuthUser(u);
          setShowAuthModal(false);
          if (u.role === 'admin') {
            navigate('/admin');
          } else if (authRoleHint === 'mentor' || u.role === 'mentor' || isFacultyEmail(u.email)) {
            navigate('/dashboard');
          } else {
            navigate('/student');
          }
        }}
        onClose={() => setShowAuthModal(false)}
        roleHint={authRoleHint}
      />

      {/* ─── Racing Lanes Backdrop ─────────────────────────────────── */}
      <div className="lp-lanes" aria-hidden="true">
        <div className="lp-lane"><i style={{ '--c': '#F59E0B', '--t': '9s', '--d': '-2s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': '#10B981', '--t': '6.5s', '--d': '-5s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': '#FBBF24', '--t': '11s', '--d': '-8s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': '#F59E0B', '--t': '7.5s', '--d': '-1s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': '#10B981', '--t': '10s', '--d': '-6s' } as React.CSSProperties}></i></div>
      </div>

      {/* ─── Header ───────────────────────────────────────────────── */}
      <header className="lp-header">
        <div className="lp-wrap lp-bar">
          <div className="lp-brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#16161D',
                border: '1.5px solid #F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(245, 158, 11, 0.35)',
                color: '#F59E0B',
                fontSize: '1.25rem',
              }}
            >
              ⚡
            </div>
            <div>
              <b>Pollmeter</b>
              <small>Live Classroom Quizzing &amp; Analytics</small>
            </div>
          </div>

          <div className="lp-acts">
            <button
              className="lp-lnk"
              onClick={() => setCurrentTheme(toggleTheme())}
              id="portal-theme-toggle-btn"
              type="button"
              title="Toggle Light / Dark theme"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" style={{ width: '1em', height: '1em' }}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            {authUser ? (
              <>
                {isFacultyUser && (
                  <button className="lp-lnk lp-hide-s" onClick={() => navigate('/dashboard')} type="button">
                    👨‍🏫 Host Studio
                  </button>
                )}
                {authUser.role === 'admin' && (
                  <button className="lp-lnk lp-hide-s" onClick={() => navigate('/admin')} type="button">
                    🏛️ Admin Console
                  </button>
                )}
                {!isFacultyUser && authUser.role !== 'admin' && (
                  <button className="lp-lnk lp-hide-s" onClick={() => navigate('/student')} type="button">
                    🎓 Student Portal
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: '#16161D',
                      border: '1px solid #F59E0B',
                      color: '#F59E0B',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {authUser.realName.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg)' }}>
                    {authUser.realName.split(' ')[0]}
                  </span>
                </div>
                <button
                  className="lp-btn"
                  onClick={() => { clearStoredAuth(); setAuthUser(null); }}
                  type="button"
                  style={{ height: '38px', padding: '0 16px', fontSize: '0.85rem' }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <a className="lp-lnk lp-hide-s" href="#how">How it works</a>
                <a className="lp-lnk lp-hide-s" href="#scoring">Scoring</a>
                <a className="lp-lnk lp-hide-s" href="#faq">FAQ</a>
                <button
                  className="lp-lnk lp-hide-s"
                  type="button"
                  onClick={() => openSignIn('student')}
                  style={{ color: '#10B981' }}
                >
                  🎓 Student Login
                </button>
                <button className="lp-btn" type="button" onClick={() => openSignIn('mentor')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" />
                  </svg>
                  Faculty &amp; Admin SSO
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main Stage ───────────────────────────────────────────── */}
      <main className="lp-main">
        {authUser ? (
          /* ── Welcome (signed-in) state ── */
          <div className="lp-wrap lp-welcome-wrap">
            <div className="lp-welcome-card">
              <div className="lp-welcome-header">
                <div className="lp-welcome-left">
                  <div className="lp-avatar">{authUser.realName.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h1 className="lp-welcome-title">Welcome back, {authUser.realName} 👋</h1>
                      <span className="lp-role-badge">
                        {authUser.role === 'admin'
                          ? '🏛️ SUPER-ADMINISTRATOR'
                          : isFacultyUser
                          ? '🎓 FACULTY MENTOR'
                          : '🎒 STUDENT PARTICIPANT'}
                      </span>
                    </div>
                    <p className="lp-welcome-sub">
                      {authUser.email} · {isFacultyUser ? 'Pollmeter Verified Faculty & Admin Portal' : 'Pollmeter Verified Student Identity'}
                    </p>
                  </div>
                </div>
                <div className="lp-welcome-actions">
                  {isFacultyUser && (
                    <button className="lp-btn lp-btn-lg" onClick={() => navigate('/dashboard')} id="welcome-host-btn" type="button">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                        <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
                      </svg>
                      Open Host Studio →
                    </button>
                  )}
                  {authUser.role === 'admin' && (
                    <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/admin')} id="welcome-admin-btn" type="button">
                      🏛️ Admin Console
                    </button>
                  )}
                  {!isFacultyUser && authUser.role !== 'admin' && (
                    <button
                      className="lp-btn lp-btn-lg"
                      onClick={() => navigate('/student')}
                      id="welcome-student-btn"
                      type="button"
                      style={{ background: '#F59E0B', color: '#000000', fontWeight: 800 }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                        <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
                      </svg>
                      Open Student Dashboard →
                    </button>
                  )}
                  <button className="lp-btn lp-btn-ghost" onClick={() => { clearStoredAuth(); setAuthUser(null); }} type="button" style={{ color: 'var(--err, #e5675a)' }}>
                    Sign Out
                  </button>
                </div>
              </div>

              <div className="lp-welcome-quick">
                {isFacultyUser ? (
                  <div className="lp-quick-card">
                    <div className="lp-quick-head">
                      <span style={{ color: 'var(--blue)' }}>⚡</span>
                      <strong>Active Classroom Host Studio</strong>
                    </div>
                    <p>Launch question banks, generate syllabus MCQs with AI, or download student attendance gradebooks.</p>
                    <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/dashboard')} type="button" style={{ width: '100%', fontSize: '0.85rem' }}>
                      Manage Quizzes &amp; Host Sessions →
                    </button>
                  </div>
                ) : (
                  <div className="lp-quick-card">
                    <div className="lp-quick-head">
                      <span style={{ color: '#F59E0B' }}>📊</span>
                      <strong>Student Academic Dashboard</strong>
                    </div>
                    <p>View your completed quizzes, attendance records, accuracy breakdown, and top-3 podium finishes.</p>
                    <button className="lp-btn" onClick={() => navigate('/student')} type="button" style={{ width: '100%', fontSize: '0.85rem' }}>
                      Open My Student Dashboard →
                    </button>
                  </div>
                )}

                <div className="lp-quick-card">
                  <div className="lp-quick-head">
                    <span style={{ color: 'var(--grn)' }}>📱</span>
                    <strong>Join Live Classroom Session</strong>
                  </div>
                  <p>Enter the 6-digit session PIN shown on the classroom projector to race in real-time.</p>
                  <form onSubmit={handleFastJoin} className="lp-pin-row">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={fastCode}
                      onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="lp-pin-single"
                      aria-label="Enter 6-digit session pin"
                      id="welcome-code-input"
                    />
                    <button type="submit" className="lp-btn" style={{ padding: '0 1.25rem' }}>
                      Join →
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Unauthenticated two-column stage ── */
          <div className="lp-wrap lp-stage">
            {/* Faculty side */}
            <section className="lp-side lp-side-f" aria-labelledby="lp-t1">
              <div className="lp-tag lp-tag-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1rem', height: '1rem' }}>
                  <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10L12 4l9.5 6z" />
                </svg>
                Teachers &amp; Faculty
              </div>
              <h1 id="lp-t1">Academic Faculty Studio</h1>
              <p>Sign in with your official @polariscampus.com credentials to generate AI questions, host projector polls, and track student attendance.</p>
              
              <ul className="lp-pts">
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>Official Faculty SSO</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>Quorum &amp; Gradebook</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>AI Question Generator</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>16:9 Projector Engine</span>
                </li>
              </ul>

              <div className="lp-go">
                <button className="lp-btn lp-btn-lg" type="button" onClick={() => openSignIn('mentor')} id="portal-faculty-signin-btn" style={{ width: '100%' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.1em', height: '1.1em' }}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" />
                  </svg>
                  <span>Sign In with Faculty SSO →</span>
                </button>

                <div className="lp-sub-card lp-sub-card-blue">
                  <span>🏛️ University Administrator or Dean?</span>
                  <button
                    type="button"
                    className="lp-lnk lp-sub-lnk-blue"
                    onClick={() => openSignIn('mentor')}
                  >
                    Admin Access →
                  </button>
                </div>
              </div>
            </section>

            {/* Student side */}
            <section className="lp-side lp-side-s" aria-labelledby="lp-t2">
              <div className="lp-tag lp-tag-grn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1rem', height: '1rem' }}>
                  <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                  <path d="M11 18.5h2" />
                </svg>
                Students &amp; Participants
              </div>
              <h1 id="lp-t2">Student Live Arena &amp; Portal</h1>
              <p>Enter the 6-digit session PIN displayed on your teacher&apos;s projector screen to join live, or open your personal student dashboard.</p>
              
              <ul className="lp-pts">
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>Real-Time WebSocket</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>60FPS Racing Podium</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>Zero App Install</span>
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.9rem', height: '0.9rem', color: '#10B981', flexShrink: 0 }}><path d="M4 10.5l4 4 8-9" /></svg>
                  <span>Medhavi Google SSO</span>
                </li>
              </ul>

              <div className="lp-go">
                {/* PIN digits entry */}
                <form className="lp-pin" onSubmit={handlePinSubmit}>
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#F59E0B' }}>
                      Enter 6-Digit Session PIN
                    </label>
                  </div>
                  <div className="lp-digits" role="group" aria-label="6-digit session PIN">
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => { digitRefs.current[i] = el; }}
                        inputMode="numeric"
                        maxLength={1}
                        placeholder={String(i + 1)}
                        aria-label={`Digit ${i + 1}`}
                        value={d}
                        onChange={(e) => handleDigitInput(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKey(i, e)}
                        onPaste={handleDigitPaste}
                        id={`portal-pin-digit-${i}`}
                        className="lp-digit-input"
                      />
                    ))}
                  </div>
                  <button className="lp-btn lp-btn-lg" type="submit" id="portal-student-join-btn" style={{ width: '100%' }}>
                    <span>Enter Live Arena</span>
                    <span style={{ fontSize: '1.15rem' }}>⚡</span>
                  </button>
                </form>

                {/* Student Dashboard Portal Access */}
                <div className="lp-sub-card lp-sub-card-amber">
                  <div>
                    <strong>Student Academic Dashboard</strong>
                    <small>View past scores, attendance, and rank records</small>
                  </div>
                  <button
                    type="button"
                    className="lp-lnk lp-sub-lnk-amber"
                    onClick={() => openSignIn('student')}
                  >
                    Student Portal →
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ─── Facts Telemetry Bar ──────────────────────────────────── */}
      <div className="lp-facts">
        <div className="lp-wrap lp-facts-inner" style={{ justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="lp-facts-chip">
            <i className="lp-live"></i>
            <span>140+ Students Active Live</span>
          </div>

          <div className="lp-facts-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', color: '#3B82F6' }}>
              <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10L12 4l9.5 6z" />
            </svg>
            <span>4 Academic Schools &amp; Batches</span>
          </div>

          <div className="lp-facts-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', color: '#F59E0B' }}>
              <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
            </svg>
            <span>60FPS Real-Time Racing Engine</span>
          </div>

          <div className="lp-facts-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', color: '#10B981' }}>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            <span>Medhavi University Identity Verified</span>
          </div>
        </div>
      </div>

      {/* ─── Below-the-fold ───────────────────────────────────────── */}
      <div className="lp-below">
        {/* Scroll cue */}
        <div className="lp-cue">
          <a href="#how">
            Scroll to learn how it works&nbsp;
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lp-cue-arrow" style={{ width: '1em', height: '1em' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>

        {/* How it works */}
        <section className="lp-sec" id="how">
          <div className="lp-wrap">
            <div className="lp-head">
              <div>
                <div className="lp-eyebrow">How it works</div>
                <h2 className="lp-h2">From sign-in to leaderboard in four steps</h2>
              </div>
              <p className="lp-lede">A live quiz needs no app and no setup for students. Faculty prepare and host; students just enter a PIN.</p>
            </div>

            <ol className="lp-steps" style={{ gap: '1.25rem' }}>
              <li>
                <div className="lp-step-card">
                  <div className="lp-step-n lp-step-n--first">1</div>
                  <h3>Faculty Sign In</h3>
                  <p>Use your verified @polariscampus.com institutional account with Google SSO or Email OTP.</p>
                </div>
              </li>
              <li>
                <div className="lp-step-card">
                  <div className="lp-step-n">2</div>
                  <h3>Build with AI</h3>
                  <p>Generate syllabus MCQs with AI, organize question banks, and launch the 16:9 big-screen projector.</p>
                </div>
              </li>
              <li>
                <div className="lp-step-card">
                  <div className="lp-step-n">3</div>
                  <h3>Students Join</h3>
                  <p>Students enter the 6-digit PIN on their phones. Real-time WebSockets connect them instantly without install.</p>
                </div>
              </li>
              <li>
                <div className="lp-step-card">
                  <div className="lp-step-n">4</div>
                  <h3>Track Analytics</h3>
                  <p>Watch the 60FPS racing leaderboard live, and export attendance records and gradebooks in one click.</p>
                </div>
              </li>
            </ol>

            <div className="lp-phases" aria-label="Live session phases">
              <b>Classroom Session Lifecycle</b>
              <span>Lobby</span><i>→</i>
              <span>Question Answering</span><i>→</i>
              <span>Live Results</span><i>→</i>
              <span>Leaderboard</span><i>→</i>
              <span>Final Podium</span>
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section className="lp-sec" id="scoring">
          <div className="lp-wrap lp-score">
            <div>
              <div className="lp-eyebrow" style={{ color: '#10B981' }}>Scoring &amp; Rules</div>
              <h2 className="lp-h2">Fast and correct wins the race</h2>
              <p className="lp-lede">Answers lock the moment you tap, so there is no submit button to hunt for. A correct answer earns base points, and answering quickly adds an exponential speed bonus.</p>
              <div className="lp-race" aria-hidden="true">
                <div>
                  <p>Quick Answer (under 3s)</p>
                  <div className="lp-track"><i style={{ '--w': '92%', '--c': '#10B981' } as React.CSSProperties}></i></div>
                </div>
                <div>
                  <p>Moderate Speed (5s–10s)</p>
                  <div className="lp-track"><i style={{ '--w': '58%', '--c': '#F59E0B' } as React.CSSProperties}></i></div>
                </div>
                <div>
                  <p>Incorrect Answer</p>
                  <div className="lp-track"><i style={{ '--w': '8%', '--c': '#EF4444' } as React.CSSProperties}></i></div>
                </div>
              </div>
            </div>

            <div className="lp-nums" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="lp-score-card">
                <div>
                  <b style={{ color: '#F59E0B', fontSize: '2.5rem', display: 'block' }}>1,000</b>
                  <span style={{ color: 'var(--fg)', fontWeight: 700 }}>Base Points</span>
                </div>
                <span style={{ color: 'var(--mute)', fontSize: '0.85rem', textAlign: 'right' }}>
                  Awarded for any correct option
                </span>
              </div>

              <div className="lp-score-card">
                <div>
                  <b style={{ color: '#10B981', fontSize: '2.5rem', display: 'block' }}>+500</b>
                  <span style={{ color: 'var(--fg)', fontWeight: 700 }}>Speed Bonus</span>
                </div>
                <span style={{ color: 'var(--mute)', fontSize: '0.85rem', textAlign: 'right' }}>
                  Decays smoothly with response timer
                </span>
              </div>

              <div className="lp-score-card">
                <div>
                  <b style={{ color: 'var(--dim)', fontSize: '2.5rem', display: 'block' }}>0</b>
                  <span style={{ color: 'var(--fg)', fontWeight: 700 }}>Incorrect Choice</span>
                </div>
                <span style={{ color: 'var(--mute)', fontSize: '0.85rem', textAlign: 'right' }}>
                  Zero points, no negative penalty
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-sec" id="faq">
          <div className="lp-wrap lp-faq">
            <div>
              <div className="lp-eyebrow">Frequently Asked Questions</div>
              <h2 className="lp-h2">Quick answers to common questions</h2>
              <p className="lp-lede">Have a question about classroom sessions, security, or identity verification? Find answers here.</p>
            </div>
            <div>
              {[
                { q: 'Do students need to install an app to participate?', a: 'No. The entire quiz engine runs directly in any modern mobile browser. Students just open the URL, type the 6-digit PIN, and enter the live race instantly.' },
                { q: 'Where do students find the 6-digit session PIN?', a: 'The faculty mentor displays the unique session PIN on the classroom projector screen when the session lobby opens.' },
                { q: 'How does the Student Dashboard work?', a: 'When students sign in with their @medhaviskillsuniversity.edu.in Google SSO, their past quiz scores, accuracy percentage, top ranks, and attendance records are permanently recorded on their dashboard.' },
                { q: 'Who has access to the Faculty Studio & Admin Console?', a: 'Access is strictly limited to verified faculty members with official @polariscampus.com accounts. University Deans and Super-Administrators have elevated access to the Central Admin Console.' },
                { q: 'Are student results and grades permanently saved?', a: 'Yes. All scores, answer breakdowns, and attendance timestamps are recorded in the cloud database so faculty can export CSV gradebooks anytime.' },
                { q: 'Can other teachers view or modify my quizzes?', a: 'No. Mentors only have access to their own quizzes, question banks, and assigned batches. Cross-mentor modification is restricted at the database level.' },
              ].map(({ q, a }) => (
                <details key={q} className="lp-detail">
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-sec">
          <div className="lp-wrap lp-help">
            <div>
              <h2 className="lp-h2">Ready to launch your classroom?</h2>
              <p className="lp-lede">Faculty sign in with Faculty SSO (@polariscampus.com). Students, keep your PIN ready.</p>
            </div>
            <div className="lp-help-acts">
              <button className="lp-btn lp-btn-lg" type="button" onClick={() => openSignIn('mentor')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                Sign In with Faculty SSO
              </button>
              <button
                className="lp-ghost"
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setTimeout(() => digitRefs.current[0]?.focus(), 400);
                }}
              >
                Enter a PIN
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-wrap lp-footer-inner">
            <span>Pollmeter · Live Classroom Quizzing &amp; Analytics Platform</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <a href="/privacy" style={{ color: 'var(--mute)', fontSize: '0.8rem', textDecoration: 'none' }}>Privacy Policy</a>
              <span style={{ color: 'var(--dim)' }}>•</span>
              <a href="/terms" style={{ color: 'var(--mute)', fontSize: '0.8rem', textDecoration: 'none' }}>Terms of Service</a>
              <span style={{ color: 'var(--dim)' }}>•</span>
              <button className="lp-top-btn" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top ↑</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
