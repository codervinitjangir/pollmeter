import { useState, useEffect, useRef } from 'react';
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
          }
        }}
        onClose={() => setShowAuthModal(false)}
        roleHint={authRoleHint}
      />

      {/* ─── Racing Lanes Backdrop ─────────────────────────────────── */}
      <div className="lp-lanes" aria-hidden="true">
        <div className="lp-lane"><i style={{ '--c': 'var(--blue)', '--t': '9s', '--d': '-2s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': 'var(--grn)', '--t': '6.5s', '--d': '-5s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': 'var(--amb)', '--t': '11s', '--d': '-8s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': 'var(--blue)', '--t': '7.5s', '--d': '-1s' } as React.CSSProperties}></i></div>
        <div className="lp-lane"><i style={{ '--c': 'var(--grn)', '--t': '10s', '--d': '-6s' } as React.CSSProperties}></i></div>
      </div>

      {/* ─── Header ───────────────────────────────────────────────── */}
      <header className="lp-header">
        <div className="lp-wrap lp-bar">
          <div className="lp-brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.7rem', height: '1.7rem' }}>
              <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10L12 4l9.5 6z" />
            </svg>
            <div>
              <b>Medhavi Skills University</b>
              <small>Polaris Campus Quizzing &amp; Live Analytics</small>
            </div>
          </div>

          <div className="lp-acts">
            <button
              className="lp-lnk"
              onClick={() => setCurrentTheme(toggleTheme())}
              id="portal-theme-toggle-btn"
              type="button"
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
                  <button className="lp-lnk lp-hide-s" onClick={() => navigate('/dashboard')} type="button">Host Studio</button>
                )}
                {authUser.role === 'admin' && (
                  <button className="lp-lnk lp-hide-s" onClick={() => navigate('/admin')} type="button">Admin Console</button>
                )}
                <button
                  className="lp-btn"
                  onClick={() => { clearStoredAuth(); setAuthUser(null); }}
                  type="button"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <a className="lp-lnk lp-hide-s" href="#how">How it works</a>
                <a className="lp-lnk lp-hide-s" href="#faq">FAQ</a>
                <button className="lp-lnk lp-hide-s" type="button" onClick={() => openSignIn('student')}>Student Login</button>
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
                      {authUser.email} · {isFacultyUser ? 'Polaris Campus Verified Faculty & Admin Portal' : 'Medhavi Skills University Verified Identity'}
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
                    <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/admin')} id="welcome-admin-btn" type="button">🏛️ Admin Console</button>
                  )}
                  <button className="lp-btn lp-btn-ghost" onClick={() => { clearStoredAuth(); setAuthUser(null); }} type="button" style={{ color: 'var(--err, #e5675a)' }}>Sign Out</button>
                </div>
              </div>

              <div className="lp-welcome-quick">
                {isFacultyUser ? (
                  <div className="lp-quick-card">
                    <div className="lp-quick-head">
                      <span style={{ color: 'var(--blue)' }}>⚡</span>
                      <strong>Active Classroom Host</strong>
                    </div>
                    <p>Launch question banks, generate syllabus MCQs, or view cross-cohort gradebook exports.</p>
                    <button className="lp-btn lp-btn-ghost" onClick={() => navigate('/dashboard')} type="button" style={{ width: '100%', fontSize: '0.82rem' }}>
                      Manage Quizzes &amp; Host Sessions →
                    </button>
                  </div>
                ) : null}

                <div className="lp-quick-card">
                  <div className="lp-quick-head">
                    <span style={{ color: 'var(--grn)' }}>📱</span>
                    <strong>Join a Live Quiz as Participant</strong>
                  </div>
                  <p>Enter the 6-digit session PIN shown on the projector to race on the leaderboard.</p>
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
                    <button type="submit" className="lp-btn" style={{ padding: '0 1.25rem' }}>Join →</button>
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.1rem', height: '1.1rem' }}>
                  <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10L12 4l9.5 6z" />
                </svg>
                Teachers &amp; Administrators
              </div>
              <h1 id="lp-t1">Academic Faculty Portal</h1>
              <p>Sign in with your official @polariscampus.com credentials to generate AI questions, host projector polls, and track student attendance analytics.</p>
              <ul className="lp-pts">
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Official @polariscampus.com Faculty SSO
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Deanonymized Student Quorum &amp; Gradebook
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  AI Question Generator from Syllabus Topics
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Live 16:9 Big-Screen Projector Display Engine
                </li>
              </ul>
              <div className="lp-go">
                <button className="lp-btn lp-btn-lg" type="button" onClick={() => openSignIn('mentor')} id="portal-faculty-signin-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 018 0v3" />
                  </svg>
                  Sign In with Faculty SSO (@polariscampus.com) →
                </button>
              </div>
            </section>

            {/* Divider */}
            <div className="lp-rule" aria-hidden="true"></div>

            {/* Student side */}
            <section className="lp-side lp-side-s" aria-labelledby="lp-t2">
              <div className="lp-tag lp-tag-grn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.1rem', height: '1.1rem' }}>
                  <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                  <path d="M11 18.5h2" />
                </svg>
                Students &amp; Audience
              </div>
              <h1 id="lp-t2">Student Live Quiz Arena</h1>
              <p>Enter the 6-digit session PIN displayed on your teacher&apos;s projector screen to join the live quiz. No app download needed.</p>
              <ul className="lp-pts">
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Instant Real-Time WebSocket Connection
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  60FPS Racing Leaderboard &amp; Streak Bonuses
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Zero app install · Works directly in your mobile browser
                </li>
                <li>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '0.95rem', height: '0.95rem', color: 'var(--grn)', flexShrink: 0, transform: 'translateY(2px)' }}><path d="M4 10.5l4 4 8-9" /></svg>
                  Medhavi Google SSO (@medhaviskillsuniversity.edu.in)
                </li>
              </ul>
              <form className="lp-pin lp-go" onSubmit={handlePinSubmit}>
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
                <button className="lp-btn lp-btn-lg" type="submit" id="portal-student-join-btn">
                  Enter Quiz →
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '0.85rem' }}>
                <button
                  type="button"
                  className="lp-lnk"
                  style={{ fontSize: '0.8rem', color: 'var(--mute)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => openSignIn('student')}
                >
                  Or sign in with @medhaviskillsuniversity.edu.in student account →
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ─── Facts Bar ────────────────────────────────────────────── */}
      <div className="lp-facts">
        <div className="lp-wrap lp-facts-inner">
          <span><i className="lp-live"></i>140+ Students Active</span>
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
              <path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2.5 10L12 4l9.5 6z" />
            </svg>
            4 Academic Schools
          </span>
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em', color: 'var(--amb)' }}>
              <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
            </svg>
            60FPS Racing Engine
          </span>
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            Medhavi EduCloud Security Verified
          </span>
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
            <ol className="lp-steps">
              <li>
                <div className="lp-step-n lp-step-n--first">1</div>
                <h3>Faculty sign in</h3>
                <p>Use your official @polariscampus.com account with Google SSO or an Email OTP Code.</p>
              </li>
              <li>
                <div className="lp-step-n">2</div>
                <h3>Build the quiz</h3>
                <p>Generate AI questions from syllabus topics, then host the poll on the classroom projector.</p>
              </li>
              <li>
                <div className="lp-step-n">3</div>
                <h3>Students join</h3>
                <p>Students enter the 6-digit PIN from the projector screen in their mobile browser. No install needed.</p>
              </li>
              <li>
                <div className="lp-step-n">4</div>
                <h3>Track the results</h3>
                <p>Watch the racing leaderboard live, then review attendance analytics and the gradebook.</p>
              </li>
            </ol>
            <div className="lp-phases" aria-label="Live session phases">
              <b>Every live session</b>
              <span>lobby</span><i>→</i>
              <span>question</span><i>→</i>
              <span>results</span><i>→</i>
              <span>leaderboard</span><i>→</i>
              <span>ended</span>
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section className="lp-sec" id="scoring">
          <div className="lp-wrap lp-score">
            <div>
              <div className="lp-eyebrow" style={{ color: 'var(--grn)' }}>For students</div>
              <h2 className="lp-h2">Fast and correct wins the race</h2>
              <p className="lp-lede">Answers lock the moment you tap, so there is no submit button to hunt for. A correct answer earns base points, and answering quickly adds a bonus.</p>
              <div className="lp-race" aria-hidden="true">
                <div>
                  <p>quick answer</p>
                  <div className="lp-track"><i style={{ '--w': '92%', '--c': 'var(--grn)' } as React.CSSProperties}></i></div>
                </div>
                <div>
                  <p>slower answer</p>
                  <div className="lp-track"><i style={{ '--w': '58%', '--c': 'var(--blue)' } as React.CSSProperties}></i></div>
                </div>
                <div>
                  <p>incorrect</p>
                  <div className="lp-track"><i style={{ '--w': '8%', '--c': 'var(--dim)' } as React.CSSProperties}></i></div>
                </div>
              </div>
            </div>
            <div className="lp-nums">
              <div><b style={{ color: 'var(--blue)' }}>1,000</b><span>Base points for a correct answer</span></div>
              <div><b style={{ color: 'var(--grn)' }}>+500</b><span>Maximum bonus for response speed</span></div>
              <div><b style={{ color: 'var(--dim)' }}>0</b><span>Points for an incorrect choice</span></div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-sec" id="faq">
          <div className="lp-wrap lp-faq">
            <div>
              <div className="lp-eyebrow">FAQ</div>
              <h2 className="lp-h2">Quick answers</h2>
              <p className="lp-lede">Can&apos;t find what you need? Ask your faculty mentor or contact support below.</p>
            </div>
            <div>
              {[
                { q: 'Do I need to install an app to join?', a: 'No. The quiz runs directly in your mobile browser. Open the page, enter the PIN and you are in.' },
                { q: 'Where do I find the 6-digit PIN?', a: 'Your teacher displays it on the classroom projector screen when the session is open.' },
                { q: 'Who can sign in to the Faculty Portal?', a: 'Faculty and administrators with an official @polariscampus.com account, using Google SSO or an Email OTP Code.' },
                { q: 'What is the difference between Google SSO and Email OTP?', a: 'Google SSO signs you in with one click using your institutional Google account. Email OTP sends a one-time code to your institutional email instead.' },
                { q: 'Can other faculty see my quizzes and gradebooks?', a: 'Mentors can only access their own quizzes, assigned batches and gradebooks. Cross-mentor access is blocked on the server.' },
                { q: 'Are results kept after the session ends?', a: 'Yes. Results are permanently stored in the cloud database so faculty can review analytics and export the gradebook, and students can follow their score history.' },
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
              <h2 className="lp-h2">Ready to start?</h2>
              <p className="lp-lede">Faculty sign in with Faculty SSO (@polariscampus.com). Students, keep the PIN ready.</p>
            </div>
            <div className="lp-help-acts">
              <button className="lp-btn lp-btn-lg" type="button" onClick={() => openSignIn('mentor')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1em', height: '1em' }}>
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 018 0v3" />
                </svg>
                Sign In with Faculty SSO
              </button>
              <a className="lp-ghost" href="#top" onClick={() => setTimeout(() => digitRefs.current[0]?.focus(), 300)}>Enter a PIN</a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-wrap lp-footer-inner">
            <span>Medhavi Skills University · Polaris Campus Quizzing &amp; Live Analytics</span>
            <button className="lp-top-btn" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top ↑</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
