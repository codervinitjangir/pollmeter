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
            <span className="pm-portal-subtitle">Polaris Campus Quizzing &amp; Live Analytics</span>
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
              {authUser.role === 'admin' && (
                <button
                  className="pm-btn-secondary"
                  onClick={() => navigate('/admin')}
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                >
                  🏛️ Admin Console
                </button>
              )}
              <button
                className="pm-btn-primary"
                onClick={() => navigate('/dashboard')}
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
              >
                ⚡ Host Studio →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="pm-btn-secondary"
                onClick={() => openSignIn('mentor')}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
              >
                Faculty Sign In
              </button>
              <button
                className="pm-btn-primary"
                onClick={() => openSignIn('mentor')}
                style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
              >
                🔐 University SSO
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pm-portal-body">
        {/* If signed in: Show Polaris Executive Welcome Banner (as in OJT/LMS screenshot) */}
        {authUser ? (
          <section className="pm-portal-welcome-card">
            <div className="pm-portal-welcome-header">
              <div className="pm-portal-welcome-left">
                <div className="pm-portal-avatar">
                  {authUser.realName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h1 className="pm-portal-welcome-title">Welcome back, {authUser.realName} 👋</h1>
                    <span className="pm-portal-role-badge">
                      {authUser.role === 'admin'
                        ? '🏛️ SUPER-ADMINISTRATOR'
                        : authUser.role === 'mentor'
                        ? '🎓 FACULTY MENTOR'
                        : '🎒 STUDENT PARTICIPANT'}
                    </span>
                  </div>
                  <p className="pm-portal-welcome-sub">
                    {authUser.email} · Medhavi Skills University Verified Identity
                  </p>
                </div>
              </div>

              <div className="pm-portal-welcome-actions">
                <button
                  className="pm-btn-primary"
                  onClick={() => navigate('/dashboard')}
                  id="welcome-host-btn"
                >
                  ⚡ Open Mentor Host Studio →
                </button>
                {authUser.role === 'admin' && (
                  <button
                    className="pm-btn-secondary"
                    onClick={() => navigate('/admin')}
                    id="welcome-admin-btn"
                  >
                    🏛️ Central Admin Console
                  </button>
                )}
                <button
                  className="pm-btn-secondary"
                  onClick={() => {
                    clearStoredAuth();
                    setAuthUser(null);
                  }}
                  style={{ color: '#EF4444' }}
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Quick Live Session Participation Inset */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1.25rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #2A2A2F',
              }}
            >
              <div
                style={{
                  background: 'var(--surface-mid, #202024)',
                  padding: '1.25rem 1.5rem',
                  borderRadius: '14px',
                  border: '1px solid #2A2A2F',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                  <span style={{ color: '#F59E0B' }}>⚡</span>
                  <strong style={{ fontSize: '0.95rem' }}>Active Classroom Host</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: '0 0 1rem', lineHeight: 1.4 }}>
                  Launch question banks, generate syllabus MCQs, or view cross-cohort gradebook exports.
                </p>
                <button
                  className="pm-btn-secondary"
                  onClick={() => navigate('/dashboard')}
                  style={{ width: '100%', fontSize: '0.82rem' }}
                >
                  Manage Quizzes &amp; Host Sessions →
                </button>
              </div>

              <div
                style={{
                  background: 'var(--surface-mid, #202024)',
                  padding: '1.25rem 1.5rem',
                  borderRadius: '14px',
                  border: '1px solid #2A2A2F',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                  <span style={{ color: '#3B82F6' }}>📱</span>
                  <strong style={{ fontSize: '0.95rem' }}>Join a Live Quiz as Participant</strong>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: '0 0 1rem', lineHeight: 1.4 }}>
                  Enter the 6-digit session PIN shown on the projector to race on the leaderboard.
                </p>
                <form onSubmit={handleFastJoin} className="pm-portal-pin-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={fastCode}
                    onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="pm-portal-pin-input"
                    aria-label="Enter 6-digit session pin"
                    id="welcome-code-input"
                  />
                  <button type="submit" className="pm-btn-primary" style={{ padding: '0 1.25rem' }}>
                    Join →
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : (
          /* Unauthenticated Polaris Access Portal */
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
                </div>
              </div>

              <div>
                <button
                  className="pm-btn-primary"
                  onClick={() => openSignIn('mentor')}
                  style={{ width: '100%', padding: '0.85rem', fontSize: '0.92rem' }}
                  id="portal-faculty-signin-btn"
                >
                  <span>🔐 Sign In with University SSO</span>
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
                    <span>Zero app install · Works directly in your mobile browser</span>
                  </div>
                </div>
              </div>

              <div>
                <form onSubmit={handleFastJoin} className="pm-portal-pin-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={fastCode}
                    onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="pm-portal-pin-input"
                    aria-label="Enter 6-digit session pin"
                    id="portal-pin-input"
                  />
                  <button
                    type="submit"
                    className="pm-btn-primary"
                    style={{ background: '#3B82F6', padding: '0 1.5rem', fontSize: '0.95rem' }}
                    id="portal-student-join-btn"
                  >
                    Enter Quiz →
                  </button>
                </form>
              </div>
            </div>
          </div>
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
            <span>Medhavi EduCloud Security Verified</span>
          </div>
        </div>
      </main>
    </div>
  );
}
