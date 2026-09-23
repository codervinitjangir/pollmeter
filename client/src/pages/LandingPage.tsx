import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="pm-landing">
      {/* Animated background blobs */}
      <div className="pm-landing-blob pm-landing-blob-1" />
      <div className="pm-landing-blob pm-landing-blob-2" />
      <div className="pm-landing-blob pm-landing-blob-3" />

      <div className="pm-landing-content">
        {/* Logo + brand */}
        <div className="pm-landing-logo">
          <svg width="52" height="52" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9H11V27H6V9Z" fill="#fff" />
            <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
            <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
          </svg>
          <span className="pm-landing-brand">PollMeter</span>
        </div>

        {/* Hero */}
        <h1 className="pm-landing-headline">
          Real-Time Quizzes<br />
          <span className="pm-landing-headline-accent">Built for Classrooms</span>
        </h1>
        <p className="pm-landing-sub">
          Generate AI-powered questions, launch live polls, and see your students respond in real time — all from one tab.
        </p>

        {/* CTA cards */}
        <div className="pm-landing-cards">
          <button
            className="pm-landing-card pm-landing-card-host"
            onClick={() => navigate('/dashboard')}
          >
            <div className="pm-landing-card-icon">🎓</div>
            <div>
              <div className="pm-landing-card-title">I'm a Teacher</div>
              <div className="pm-landing-card-desc">Create &amp; host a quiz session</div>
            </div>
            <span className="pm-landing-card-arrow">→</span>
          </button>

          <button
            className="pm-landing-card pm-landing-card-join"
            onClick={() => navigate('/join')}
          >
            <div className="pm-landing-card-icon">📱</div>
            <div>
              <div className="pm-landing-card-title">I'm a Student</div>
              <div className="pm-landing-card-desc">Join with a session code</div>
            </div>
            <span className="pm-landing-card-arrow">→</span>
          </button>
        </div>

        {/* Features strip */}
        <div className="pm-landing-features">
          <span>✦ AI Question Generator</span>
          <span>✦ Live Leaderboard</span>
          <span>✦ Instant Feedback</span>
          <span>✦ Works on any device</span>
        </div>
      </div>
    </div>
  );
}
