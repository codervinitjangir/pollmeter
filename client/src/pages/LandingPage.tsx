import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveTheme, toggleTheme, Theme } from '../theme';
import { getAuthUser, clearStoredAuth, AuthUser, refreshAuthUser } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';

export default function LandingPage() {
  const navigate = useNavigate();
  const [fastCode, setFastCode] = useState('');
  const [theme, setCurrentTheme] = useState<Theme>(getActiveTheme());
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRoleHint, setAuthRoleHint] = useState<'student' | 'mentor'>('student');

  useEffect(() => {
    refreshAuthUser().then((synced) => {
      if (synced) setAuthUser(synced);
    });
  }, []);

  function handleFastJoin(e: React.FormEvent) {
    e.preventDefault();
    const clean = fastCode.trim().replace(/\D/g, '');
    if (clean.length === 6) {
      navigate(`/join?code=${clean}`);
    } else {
      navigate('/join');
    }
  }

  function openSignIn(role: 'student' | 'mentor') {
    setAuthRoleHint(role);
    setShowAuthModal(true);
  }

  const isFacultyUser = authUser && (authUser.role === 'mentor' || authUser.role === 'admin');

  return (
    <div className="pm-portal-landing">
      <CollegeAuthModal
        isOpen={showAuthModal}
        title={authRoleHint === 'mentor' ? 'University Faculty & Admin Access' : 'Student Classroom Login'}
        subtitle={
          authRoleHint === 'mentor'
            ? 'Access restricted to verified @polariscampus.com faculty & administrators'
            : 'Sign in with your official university credentials'
        }
        onSuccess={(u) => {
          setAuthUser(u);
          setShowAuthModal(false);
        }}
        onClose={() => setShowAuthModal(false)}
        roleHint={authRoleHint}
      />

      {/* Top Polaris Navbar */}
      <header className="pm-portal-nav">
        <div className="pm-portal-brand" onClick={() => navigate('/')}>
          <div className="pm-portal-crest">
            <span>🏛️</span>
          </div>
          <div>
            <span className="pm-portal-title">Medhavi Skills University</span>
            <span className="pm-portal-subtitle">
              <span className="pm-portal-live-dot" />
              Polaris Campus Quizzing &amp; Live Analytics
            </span>
          </div>
        </div>

        <div className="pm-portal-nav-actions">
          <button
            className="pm-theme-toggle-btn"
            onClick={() => setCurrentTheme(toggleTheme())}
            title="Toggle Theme"
            id="portal-theme-toggle-btn"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          {authUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div className="pm-portal-nav-user-chip">
                <span className="pm-portal-nav-mini-avatar">
                  {authUser.realName.slice(0, 1).toUpperCase()}
                </span>
                <span>{authUser.realName.split(' ')[0]}</span>
              </div>

              {authUser.role === 'admin' && (
                <button
                  className="pm-btn-secondary"
                  onClick={() => navigate('/admin')}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                  id="nav-admin-btn"
                >
                  🏛️ Admin
                </button>
              )}

              {isFacultyUser && (
                <button
                  className="pm-btn-primary"
                  onClick={() => navigate('/dashboard')}
                  style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                  id="nav-host-btn"
                >
                  ⚡ Host Studio →
                </button>
              )}

              <button
                className="pm-btn-danger-ghost"
                onClick={() => {
                  clearStoredAuth();
                  setAuthUser(null);
                }}
                id="portal-signout-btn"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="pm-btn-secondary"
                onClick={() => openSignIn('student')}
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                id="nav-student-signin-btn"
              >
                Student Login
              </button>
              <button
                className="pm-btn-primary"
                onClick={() => openSignIn('mentor')}
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                id="nav-faculty-signin-btn"
              >
                🔐 Faculty SSO
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pm-portal-body">
        {authUser ? (
          <>
            {/* ─── Executive Welcome Banner ─── */}
            <section className="pm-portal-welcome-card">
              <div className="pm-portal-welcome-header">
                <div className="pm-portal-welcome-left">
                  <div
                    className={`pm-portal-avatar ${
                      isFacultyUser ? 'pm-portal-avatar-faculty' : ''
                    }`}
                  >
                    {authUser.realName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="pm-portal-welcome-title">
                      <span>Welcome back, {authUser.realName} 👋</span>
                      <span
                        className={`pm-portal-role-badge ${
                          authUser.role === 'admin'
                            ? 'pm-portal-role-badge-admin'
                            : authUser.role === 'mentor'
                            ? 'pm-portal-role-badge-faculty'
                            : 'pm-portal-role-badge-student'
                        }`}
                      >
                        {authUser.role === 'admin'
                          ? '🏛️ SUPER-ADMINISTRATOR'
                          : authUser.role === 'mentor'
                          ? '🎓 FACULTY MENTOR'
                          : '🎒 STUDENT PARTICIPANT'}
                      </span>
                    </h1>
                    <p className="pm-portal-welcome-sub">
                      <span>{authUser.email}</span>
                      <span>•</span>
                      <span>
                        {authUser.role === 'student'
                          ? 'Medhavi Skills University Verified Identity'
                          : 'Polaris Campus Verified Faculty & Admin Portal'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pm-portal-welcome-actions">
                  {authUser.role === 'admin' && (
                    <button
                      className="pm-btn-secondary"
                      onClick={() => navigate('/admin')}
                      id="welcome-admin-btn"
                    >
                      🏛️ Admin Console
                    </button>
                  )}
                  {isFacultyUser && (
                    <button
                      className="pm-btn-primary"
                      onClick={() => navigate('/dashboard')}
                      id="welcome-host-btn"
                    >
                      ⚡ Open Mentor Host Studio →
                    </button>
                  )}
                  <button
                    className="pm-btn-danger-ghost"
                    onClick={() => {
                      clearStoredAuth();
                      setAuthUser(null);
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </section>

            {/* ─── ROLE-SPECIFIC DASHBOARD SECTIONS ─── */}
            {authUser.role === 'student' ? (
              <>
                {/* 1. HERO PARTICIPATION TERMINAL FOR STUDENTS */}
                <section className="pm-portal-hero-terminal">
                  <div className="pm-terminal-icon-bubble">📱</div>
                  <div className="pm-terminal-header">
                    <h2>Join a Live Classroom Session</h2>
                    <p>
                      Enter the 6-digit session PIN from your professor&apos;s projector screen to enter the arena and race on the leaderboard.
                    </p>
                  </div>

                  <form onSubmit={handleFastJoin} className="pm-terminal-pin-form">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={fastCode}
                      onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="pm-terminal-pin-input"
                      aria-label="Enter 6-digit session pin"
                      id="welcome-code-input"
                      autoFocus
                    />
                    <button type="submit" className="pm-terminal-join-btn" id="welcome-join-btn">
                      <span>Enter Quiz Arena</span>
                      <span>→</span>
                    </button>
                  </form>

                  <div className="pm-terminal-pills-row">
                    <span className="pm-terminal-pill">⚡ 60 FPS Real-Time Racing</span>
                    <span className="pm-terminal-pill">🏆 Instant Leaderboard Podium</span>
                    <span className="pm-terminal-pill">🔒 Auto-Synced Gradebook Attendance</span>
                  </div>
                </section>

                {/* 2. THREE STUDENT VALUE PILLARS */}
                <section className="pm-portal-feature-grid">
                  <div className="pm-portal-feature-card">
                    <div>
                      <div className="pm-card-top-icon">🏎️</div>
                      <h3 className="pm-card-title">Real-Time Speed Scoring</h3>
                      <p className="pm-card-desc">
                        Every millisecond counts. Answering accurately within the first few seconds multiplies your points and elevates your avatar on the classroom podium.
                      </p>
                    </div>
                    <div className="pm-card-footer">
                      <span className="pm-card-tag">Speed Bonus Engine</span>
                    </div>
                  </div>

                  <div className="pm-portal-feature-card">
                    <div>
                      <div className="pm-card-top-icon">📋</div>
                      <h3 className="pm-card-title">Deanonymized Attendance</h3>
                      <p className="pm-card-desc">
                        Your submissions are cryptographically linked to your official ID (<code>{authUser.email}</code>). Zero proxy participation, with verified attendance logs.
                      </p>
                    </div>
                    <div className="pm-card-footer">
                      <span className="pm-card-tag">Zero-Proxy Sync</span>
                    </div>
                  </div>

                  <div className="pm-portal-feature-card">
                    <div>
                      <div className="pm-card-top-icon">🏛️</div>
                      <h3 className="pm-card-title">Faculty &amp; Mentor Access</h3>
                      <p className="pm-card-desc">
                        Need to create or host quizzes? Faculty access is restricted to verified <code>@polariscampus.com</code> institutional accounts.
                      </p>
                    </div>
                    <div className="pm-card-footer">
                      <button
                        className="pm-btn-ghost"
                        onClick={() => openSignIn('mentor')}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                      >
                        Switch to Faculty SSO →
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              /* ─── FACULTY / MENTOR COMMAND CENTER ─── */
              <section className="pm-portal-feature-grid">
                <div className="pm-portal-feature-card">
                  <div>
                    <div className="pm-card-top-icon">🚀</div>
                    <h3 className="pm-card-title">Launch Live Quiz Studio</h3>
                    <p className="pm-card-desc">
                      Start a live classroom session, display the projector big-screen mode, and control question pacing with live voting.
                    </p>
                  </div>
                  <div className="pm-card-footer">
                    <button
                      className="pm-btn-primary"
                      onClick={() => navigate('/dashboard')}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      Open Host Studio →
                    </button>
                  </div>
                </div>

                <div className="pm-portal-feature-card">
                  <div>
                    <div className="pm-card-top-icon">🤖</div>
                    <h3 className="pm-card-title">AI Syllabus Question Maker</h3>
                    <p className="pm-card-desc">
                      Generate exam-grade multiple-choice questions in seconds using syllabus notes, lecture topics, or custom prompts.
                    </p>
                  </div>
                  <div className="pm-card-footer">
                    <button
                      className="pm-btn-secondary"
                      onClick={() => navigate('/dashboard')}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      Generate Questions →
                    </button>
                  </div>
                </div>

                <div className="pm-portal-feature-card">
                  <div>
                    <div className="pm-card-top-icon">📊</div>
                    <h3 className="pm-card-title">Attendance &amp; Analytics</h3>
                    <p className="pm-card-desc">
                      Review question difficulty curves, track student response times, and export official CSV gradebooks for accreditation.
                    </p>
                  </div>
                  <div className="pm-card-footer">
                    <button
                      className="pm-btn-secondary"
                      onClick={() => navigate('/dashboard')}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      View Reports →
                    </button>
                  </div>
                </div>

                <div className="pm-portal-feature-card">
                  <div>
                    <div className="pm-card-top-icon">📱</div>
                    <h3 className="pm-card-title">Test Participant View</h3>
                    <p className="pm-card-desc">
                      Enter a 6-digit session PIN to preview your live quiz from a student participant&apos;s mobile perspective.
                    </p>
                  </div>
                  <form onSubmit={handleFastJoin} className="pm-card-footer" style={{ gap: '0.5rem' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={fastCode}
                      onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="PIN"
                      className="pm-terminal-pin-input"
                      style={{ height: '38px', fontSize: '0.95rem' }}
                    />
                    <button type="submit" className="pm-btn-secondary" style={{ padding: '0.4rem 0.85rem' }}>
                      Join →
                    </button>
                  </form>
                </div>
              </section>
            )}
          </>
        ) : (
          /* ─── UNAUTHENTICATED POLARIS ACCESS PORTAL ─── */
          <>
            <div className="pm-portal-hero-intro">
              <span className="pm-portal-hero-badge">
                <span>⚡</span> Official Medhavi Skills University Arena &bull; Polaris Campus
              </span>
              <h1 className="pm-portal-hero-headline">
                Interactive Classroom Quizzes.{' '}
                <span className="pm-portal-hero-headline-accent">Real-Time Leaderboards.</span>
              </h1>
              <p className="pm-portal-hero-desc">
                High-engagement campus polling and competitive arenas. Built for faculty projectors and mobile student responses with zero app installation.
              </p>
            </div>

            <div className="pm-portal-grid">
              {/* Faculty & Admin Portal Card */}
              <div className="pm-portal-card pm-portal-card-faculty">
                <div>
                  <span className="pm-portal-card-badge pm-portal-badge-faculty">
                    <span>🏛️</span> TEACHERS &amp; ADMINISTRATORS
                  </span>
                  <h2 className="pm-portal-card-title">Academic Faculty Portal</h2>
                  <p className="pm-portal-card-desc">
                    Sign in with your official @polariscampus.com credentials to generate AI questions, host projector polls, and track student attendance analytics.
                  </p>

                  <div className="pm-portal-features">
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Official @polariscampus.com Faculty SSO</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Deanonymized Student Quorum &amp; Gradebook</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>AI Question Generator from Syllabus Topics</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Live 16:9 Big-Screen Projector Display Engine</span>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    className="pm-btn-faculty-primary"
                    onClick={() => openSignIn('mentor')}
                    id="portal-faculty-signin-btn"
                  >
                    <span>🔐</span> Sign In with Faculty SSO (@polariscampus.com) →
                  </button>
                </div>
              </div>

              {/* Student & Participant Card */}
              <div className="pm-portal-card pm-portal-card-student">
                <div>
                  <span className="pm-portal-card-badge pm-portal-badge-student">
                    <span>📱</span> STUDENTS &amp; AUDIENCE
                  </span>
                  <h2 className="pm-portal-card-title">Student Live Quiz Arena</h2>
                  <p className="pm-portal-card-desc">
                    Enter the 6-digit session PIN displayed on your teacher&apos;s projector screen to join the live quiz. No app download needed.
                  </p>

                  <div className="pm-portal-features">
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Instant Real-Time WebSocket Connection</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>60FPS Racing Leaderboard &amp; Streak Bonuses</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Zero app install &middot; Works directly in your mobile browser</span>
                    </div>
                    <div className="pm-portal-feat-line">
                      <span className="pm-portal-feat-check">✓</span>
                      <span>Medhavi Google SSO (@medhaviskillsuniversity.edu.in)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <form onSubmit={handleFastJoin} className="pm-portal-pin-box">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      value={fastCode}
                      onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="pm-portal-pin-input-field"
                      aria-label="Enter 6-digit session pin"
                      id="portal-pin-input"
                    />
                    <button
                      type="submit"
                      className="pm-btn-student-submit"
                      id="portal-student-join-btn"
                    >
                      Enter Quiz →
                    </button>
                  </form>
                  <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => openSignIn('student')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted, #64748b)',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: '0.25rem',
                      }}
                    >
                      Or sign in with @medhaviskillsuniversity.edu.in student account
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3-Step Campus Quizzing Walkthrough */}
            <div className="pm-portal-how-it-works">
              <div className="pm-how-header">
                <h3 className="pm-how-title">How Live Campus Quizzing Works</h3>
                <p className="pm-how-subtitle">Simple, zero-setup interactive learning designed for modern lecture halls</p>
              </div>
              <div className="pm-steps-grid">
                <div className="pm-step-card">
                  <div className="pm-step-badge-num">1</div>
                  <h4 className="pm-step-heading">Professor Launches</h4>
                  <p className="pm-step-text">
                    Faculty creates AI questions or picks a topic, projecting the big-screen PIN code on the lecture hall display.
                  </p>
                </div>
                <div className="pm-step-card">
                  <div className="pm-step-badge-num">2</div>
                  <h4 className="pm-step-heading">Students Enter PIN</h4>
                  <p className="pm-step-text">
                    Attendees enter the 6-digit code on their phones. Zero installations, instant WebSocket pairing in 200ms.
                  </p>
                </div>
                <div className="pm-step-card">
                  <div className="pm-step-badge-num">3</div>
                  <h4 className="pm-step-heading">60FPS Live Podium</h4>
                  <p className="pm-step-text">
                    Answer speed &amp; accuracy boost rankings in real-time, instantly exported to campus gradebooks.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Bottom Campus Telemetry Bar */}
        <div className="pm-portal-telemetry">
          <div className="pm-portal-telemetry-item">
            <span style={{ color: '#10B981' }}>●</span>
            <span>140+ Students Active</span>
          </div>
          <div className="pm-portal-telemetry-item">
            <span>🏛️</span>
            <span>4 Academic Schools</span>
          </div>
          <div className="pm-portal-telemetry-item">
            <span>⚡</span>
            <span>60FPS Racing Engine</span>
          </div>
          <div className="pm-portal-telemetry-item">
            <span>🔒</span>
            <span>Medhavi &amp; Polaris EduCloud Security</span>
          </div>
        </div>
      </main>
    </div>
  );
}
