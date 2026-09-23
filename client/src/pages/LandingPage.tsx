import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();
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

  return (
    <div className="pm-landing">
      {/* Background patterns */}
      <div className="pm-landing-grid" aria-hidden="true" />
      <div className="pm-landing-blob pm-landing-blob-1" aria-hidden="true" />
      <div className="pm-landing-blob pm-landing-blob-2" aria-hidden="true" />
      <div className="pm-landing-blob pm-landing-blob-3" aria-hidden="true" />

      {/* Floating Light Navbar */}
      <header className="pm-landing-nav">
        <div className="pm-landing-nav-logo" onClick={() => navigate('/')}>
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="11" width="6" height="18" rx="2" fill="#0F172A" />
            <rect x="15" y="16" width="6" height="13" rx="2" fill="#F43F5E" />
            <rect x="25" y="7" width="6" height="22" rx="2" fill="#1F69FF" />
          </svg>
          <span className="pm-landing-nav-brand">PollMeter</span>
          <span className="pm-landing-nav-pill">Live Classroom</span>
        </div>

        <div className="pm-landing-nav-actions">
          <button
            className="pm-landing-nav-btn pm-landing-nav-btn-secondary"
            onClick={() => navigate('/join')}
            id="nav-join-btn"
          >
            Enter Code
          </button>
          <button
            className="pm-landing-nav-btn pm-landing-nav-btn-primary"
            onClick={() => navigate('/dashboard')}
            id="nav-host-btn"
          >
            Host Quiz →
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pm-landing-content">
        {/* Pill Badge */}
        <div className="pm-landing-badge">
          <span>✨</span> Mentimeter-Style Real-Time Polling &amp; Quizzes
        </div>

        {/* Hero Headline */}
        <h1 className="pm-landing-headline">
          Real-Time Classroom Quizzes<br />
          <span className="pm-landing-headline-accent">Made Engaging &amp; Simple</span>
        </h1>

        {/* Subtitle */}
        <p className="pm-landing-sub">
          Generate AI-powered questions in seconds, launch live projector polls,
          and watch your students compete on an animated racing leaderboard.
        </p>

        {/* Primary Role Cards */}
        <div className="pm-landing-cards">
          {/* Teacher / Host Card */}
          <div className="pm-landing-card pm-landing-card-host">
            <div className="pm-landing-card-top">
              <div className="pm-landing-card-icon-wrap pm-landing-card-icon-host">
                🎓
              </div>
              <div className="pm-landing-card-title-wrap">
                <span className="pm-landing-card-role pm-landing-card-role-host">Presenters &amp; Teachers</span>
                <h2 className="pm-landing-card-title">I&apos;m a Teacher</h2>
              </div>
            </div>

            <p className="pm-landing-card-desc">
              Create AI questions, launch live projector sessions, control countdown timers, and reveal correct answers.
            </p>

            <div className="pm-landing-card-chips">
              <span className="pm-landing-card-chip">✨ AI Question Generator</span>
              <span className="pm-landing-card-chip">📊 Column Charts</span>
              <span className="pm-landing-card-chip">🏆 Racing Leaderboard</span>
            </div>

            <button
              className="pm-landing-card-action pm-landing-card-action-host"
              onClick={() => navigate('/dashboard')}
              id="landing-host-btn"
            >
              <span>Create &amp; Host Session</span>
              <span>→</span>
            </button>
          </div>

          {/* Student / Participant Card */}
          <div className="pm-landing-card pm-landing-card-join">
            <div className="pm-landing-card-top">
              <div className="pm-landing-card-icon-wrap pm-landing-card-icon-join">
                📱
              </div>
              <div className="pm-landing-card-title-wrap">
                <span className="pm-landing-card-role pm-landing-card-role-join">Students &amp; Audience</span>
                <h2 className="pm-landing-card-title">I&apos;m a Student</h2>
              </div>
            </div>

            <p className="pm-landing-card-desc">
              Have a 6-digit pin from your teacher? Enter it below to join the classroom buzzer and race for 1st place!
            </p>

            <form onSubmit={handleFastJoin} className="pm-landing-fast-join">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={fastCode}
                onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                className="pm-landing-code-input"
                aria-label="Enter 6-digit session pin"
                id="landing-code-input"
              />
              <button
                type="submit"
                className="pm-landing-fast-join-btn"
                id="landing-quick-join-btn"
              >
                Join →
              </button>
            </form>

            <div className="pm-landing-card-chips">
              <span className="pm-landing-card-chip">⚡ Sub-50ms Buzzer</span>
              <span className="pm-landing-card-chip">📱 Zero App Install</span>
              <span className="pm-landing-card-chip">🎉 Instant Feedback</span>
            </div>
          </div>
        </div>

        {/* Live Quiz Preview Mockup */}
        <div className="pm-landing-mockup" aria-label="PollMeter presentation preview">
          <div className="pm-landing-mockup-header">
            <span className="pm-landing-mockup-tag">
              <span>📽️</span> Projector Live View · Question 1 of 5
            </span>
            <span className="pm-landing-mockup-timer">
              ⏱ 12s remaining
            </span>
          </div>

          <h3 className="pm-landing-mockup-q">
            Which planet in our solar system is known as the &ldquo;Red Planet&rdquo;?
          </h3>

          <div className="pm-landing-mockup-bars">
            <div className="pm-landing-mock-col">
              <span className="pm-landing-mock-pct">12%</span>
              <div className="pm-landing-mock-bar" style={{ height: '35px', background: '#38BDF8' }} />
              <span className="pm-landing-mock-lbl">A. Venus</span>
            </div>

            <div className="pm-landing-mock-col">
              <span className="pm-landing-mock-pct" style={{ color: '#16A34A', fontWeight: 800 }}>76% ✔</span>
              <div className="pm-landing-mock-bar" style={{ height: '115px', background: '#34D399', boxShadow: '0 0 12px rgba(52, 211, 153, 0.4)' }} />
              <span className="pm-landing-mock-lbl" style={{ color: '#16A34A', fontWeight: 800 }}>B. Mars</span>
            </div>

            <div className="pm-landing-mock-col">
              <span className="pm-landing-mock-pct">8%</span>
              <div className="pm-landing-mock-bar" style={{ height: '24px', background: '#FBBF24' }} />
              <span className="pm-landing-mock-lbl">C. Jupiter</span>
            </div>

            <div className="pm-landing-mock-col">
              <span className="pm-landing-mock-pct">4%</span>
              <div className="pm-landing-mock-bar" style={{ height: '15px', background: '#A78BFA' }} />
              <span className="pm-landing-mock-lbl">D. Mercury</span>
            </div>
          </div>
        </div>

        {/* Features Strip */}
        <div className="pm-landing-features">
          <span className="pm-landing-feat-item">⚡ Sub-50ms WebSockets</span>
          <span className="pm-landing-feat-item">✨ AI Quiz Generation</span>
          <span className="pm-landing-feat-item">📊 Vertical Mentimeter Charts</span>
          <span className="pm-landing-feat-item">🏎️ 60FPS Racing Leaderboard</span>
          <span className="pm-landing-feat-item">📱 Phone, Tablet &amp; Laptop</span>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="pm-landing-footer">
        PollMeter · Built for interactive classrooms &amp; live presentations.
      </footer>
    </div>
  );
}
