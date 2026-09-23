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
      {/* Background ambient blobs and subtle grid */}
      <div className="pm-landing-grid" aria-hidden="true" />
      <div className="pm-landing-blob pm-landing-blob-1" aria-hidden="true" />
      <div className="pm-landing-blob pm-landing-blob-2" aria-hidden="true" />

      {/* Top Navbar */}
      <header className="pm-landing-nav">
        <div className="pm-landing-nav-logo" onClick={() => navigate('/')}>
          <svg width="30" height="30" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      {/* Main Single-Screen Hero Container */}
      <main className="pm-landing-content">
        <div className="pm-landing-badge">
          <span>✨</span> Real-Time Classroom Polling &amp; Quizzes
        </div>

        <h1 className="pm-landing-headline">
          Real-Time Classroom Quizzes<br />
          <span className="pm-landing-headline-accent">Made Engaging &amp; Simple</span>
        </h1>

        <p className="pm-landing-sub">
          Generate AI questions, launch live polls with countdown timers,
          and watch scores climb on an animated racing leaderboard.
        </p>

        {/* Dual Action Cards */}
        <div className="pm-landing-cards">
          {/* Teacher Card */}
          <div className="pm-landing-card pm-landing-card-host">
            <div className="pm-landing-card-top">
              <div className="pm-landing-card-icon-wrap pm-landing-card-icon-host">
                🎓
              </div>
              <div className="pm-landing-card-title-wrap">
                <span className="pm-landing-card-role pm-landing-card-role-host">Teachers &amp; Presenters</span>
                <h2 className="pm-landing-card-title">I&apos;m a Teacher</h2>
              </div>
            </div>

            <p className="pm-landing-card-desc">
              Create AI questions, launch live projector polls, and reveal leaderboard standings.
            </p>

            <button
              className="pm-landing-card-action pm-landing-card-action-host"
              onClick={() => navigate('/dashboard')}
              id="landing-host-btn"
            >
              <span>Create &amp; Host Quiz</span>
              <span>→</span>
            </button>
          </div>

          {/* Student Card */}
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
              Enter the 6-digit code shown on your teacher&apos;s screen to join the live quiz.
            </p>

            <form onSubmit={handleFastJoin} className="pm-landing-fast-join">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={fastCode}
                onChange={(e) => setFastCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
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
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="pm-landing-features">
          <span className="pm-landing-feat-item">✦ AI Question Generator</span>
          <span className="pm-landing-feat-item">✦ Mentimeter Vertical Bars</span>
          <span className="pm-landing-feat-item">✦ 60FPS Racing Leaderboard</span>
          <span className="pm-landing-feat-item">✦ Zero App Install</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="pm-landing-footer">
        PollMeter · Interactive real-time quizzes &amp; audience polling for classrooms
      </footer>
    </div>
  );
}
