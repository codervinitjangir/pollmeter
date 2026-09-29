import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthUser, clearStoredAuth, fetchStudentQuizzes, isFacultyEmail, AuthUser } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';
import { getActiveTheme, toggleTheme } from '../theme';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(() => !getAuthUser());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getActiveTheme());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const terminalRef = useRef<HTMLDivElement | null>(null);

  // Quiz history & analytics
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'podium'>('all');

  // Live PIN join terminal
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [screenName, setScreenName] = useState(() => {
    const u = getAuthUser();
    return u?.realName ? u.realName.split(' ')[0] : '';
  });
  const [pinError, setPinError] = useState('');
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load past quiz analytics when authenticated
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    setError('');
    fetchStudentQuizzes()
      .then((data) => setHistory(data || []))
      .catch((err) => setError(err.message || 'Unable to retrieve quiz records'))
      .finally(() => setLoading(false));
  }, [authUser]);

  // Handle PIN typing
  function handleDigitChange(index: number, val: string) {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setPinError('');
    if (char && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = [...digits];
    [...text].forEach((c, k) => { next[k] = c; });
    setDigits(next);
    digitRefs.current[Math.min(text.length, 5)]?.focus();
  }

  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) {
      setPinError('Please enter the 6-digit session PIN displayed by your mentor.');
      return;
    }
    const name = screenName.trim() || (authUser ? authUser.realName.split(' ')[0] : 'Student');
    navigate(`/join?code=${code}&name=${encodeURIComponent(name)}`);
  }

  // Analytics computation
  const stats = useMemo(() => {
    const totalSessions = history.length;
    let totalScore = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;
    let bestRank: number | null = null;
    let podiumFinishes = 0;
    const subjectsMap = new Map<string, number>();

    for (const item of history) {
      const p = item.participant || {};
      const s = item.session || {};
      totalScore += p.finalScore || 0;
      totalCorrect += p.correctCount || 0;
      totalQuestions += p.totalQuestions || 0;

      if (typeof p.rank === 'number' && p.rank > 0) {
        if (bestRank === null || p.rank < bestRank) {
          bestRank = p.rank;
        }
        if (p.rank <= 3) {
          podiumFinishes += 1;
        }
      }

      const subj = s.subject || 'General';
      subjectsMap.set(subj, (subjectsMap.get(subj) || 0) + 1);
    }

    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const subjectsList = Array.from(subjectsMap.entries()).map(([name, count]) => ({ name, count }));

    return {
      totalSessions,
      totalScore,
      totalCorrect,
      totalQuestions,
      accuracy,
      bestRank,
      podiumFinishes,
      subjectsList,
    };
  }, [history]);

  // Filtered quizzes
  const filteredHistory = useMemo(() => {
    let list = [...history];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => {
        const topic = (item.session?.topic || '').toLowerCase();
        const subject = (item.session?.subject || '').toLowerCase();
        const mentor = (item.session?.hostName || '').toLowerCase();
        return topic.includes(q) || subject.includes(q) || mentor.includes(q);
      });
    }

    if (filterType === 'podium') {
      list = list.filter((item) => typeof item.participant?.rank === 'number' && item.participant.rank <= 3);
    }

    return list;
  }, [history, searchQuery, filterType]);

  const isFaculty = Boolean(
    authUser && (authUser.role === 'mentor' || authUser.role === 'admin' || isFacultyEmail(authUser.email))
  );

  return (
    <div className="menti-app-shell pm-admin-shell pm-student-shell">
      {/* College Auth Modal if student is not logged in */}
      <CollegeAuthModal
        isOpen={showAuthModal || !authUser}
        title="Pollmeter Student Portal Login"
        subtitle="Sign in with your verified student account to view your quiz scores, attendance, and rank records."
        onSuccess={(u) => {
          setAuthUser(u);
          setShowAuthModal(false);
          if (!screenName) {
            setScreenName(u.realName.split(' ')[0]);
          }
        }}
        onClose={authUser ? () => setShowAuthModal(false) : undefined}
        roleHint="student"
      />

      {/* ─── LEFT SIDEBAR (Matching Mentor Host Studio & Admin Console) ─── */}
      <aside className={`menti-sidebar pm-admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        <div>
          {/* Brand Crest */}
          <a href="/student" className="menti-sidebar-brand" style={{ textDecoration: 'none' }}>
            <div className="pm-admin-sidebar-crest">
              <span style={{ fontSize: '1.15rem' }}>⚡</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.18rem', letterSpacing: '-0.025em', color: 'var(--text-primary, #FFFFFF)', lineHeight: 1.15 }}>
                Pollmeter
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                <span className="pm-badge-student-sub">
                  <span className="pm-sub-badge-dot pm-sub-badge-dot-emerald" />
                  Student Portal
                </span>
              </div>
            </div>
          </a>

          {/* Primary Action Button (Enter Quiz PIN) */}
          <button
            className="menti-btn-new pm-admin-sidebar-cta"
            onClick={() => {
              terminalRef.current?.scrollIntoView({ behavior: 'smooth' });
              digitRefs.current[0]?.focus();
              setMobileSidebarOpen(false);
            }}
            id="student-sidebar-join-btn"
          >
            <span>⚡</span>
            <span>Enter Quiz PIN</span>
          </button>

          {/* Navigation Links */}
          <nav className="menti-nav-group">
            <div className="menti-nav-title">ACADEMIC ARENA</div>
            <button
              className={`menti-nav-link ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => {
                setFilterType('all');
                setMobileSidebarOpen(false);
              }}
            >
              <span>📜</span>
              <span>All Quiz Records</span>
              <span className="pm-tab-pill">{history.length}</span>
            </button>

            <button
              className={`menti-nav-link ${filterType === 'podium' ? 'active' : ''}`}
              onClick={() => {
                setFilterType('podium');
                setMobileSidebarOpen(false);
              }}
            >
              <span>🏆</span>
              <span>Podium Finishes</span>
              <span className="pm-tab-pill" style={{ color: '#F59E0B' }}>
                {stats.podiumFinishes}
              </span>
            </button>

            <button
              className="menti-nav-link"
              onClick={() => {
                terminalRef.current?.scrollIntoView({ behavior: 'smooth' });
                digitRefs.current[0]?.focus();
                setMobileSidebarOpen(false);
              }}
            >
              <span>🎮</span>
              <span>Live Classroom PIN</span>
              <span className="pm-sidebar-pending-dot" title="Live Terminal Ready" />
            </button>
          </nav>

          {/* Cross-portal Shortcuts */}
          <div className="menti-nav-group">
            <div className="menti-nav-title">CAMPUS SHORTCUTS</div>
            {isFaculty && (
              <button
                className="menti-nav-link"
                onClick={() => {
                  navigate('/dashboard');
                  setMobileSidebarOpen(false);
                }}
                title="Switch to Mentor Host Studio"
              >
                <span>👨‍🏫</span>
                <span>Mentor Studio</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#60A5FA' }}>→</span>
              </button>
            )}

            {authUser?.role === 'admin' && (
              <button
                className="menti-nav-link"
                onClick={() => {
                  navigate('/admin');
                  setMobileSidebarOpen(false);
                }}
                title="Open University Admin Console"
              >
                <span>🛡️</span>
                <span>Admin Console</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#F59E0B' }}>→</span>
              </button>
            )}

            <button
              className="menti-nav-link"
              onClick={() => {
                navigate('/');
                setMobileSidebarOpen(false);
              }}
              title="Go to University Landing Page"
            >
              <span>🏛️</span>
              <span>Campus Home</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="menti-sidebar-footer">
          <button
            className="menti-nav-link"
            onClick={() => setTheme(toggleTheme())}
            title="Toggle Dark / Light Theme"
            id="student-sidebar-theme-toggle"
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {authUser && (
            <div className="pm-admin-sidebar-user">
              <div
                className="pm-admin-sidebar-user-avatar"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#FFFFFF',
                }}
              >
                {authUser.realName.slice(0, 2).toUpperCase()}
              </div>
              <div className="pm-admin-sidebar-user-info">
                <span className="pm-admin-sidebar-user-name" title={authUser.realName}>
                  {authUser.realName}
                </span>
                <span className="pm-admin-sidebar-user-email" title={authUser.email}>
                  🎓 {authUser.email.split('@')[0]}
                </span>
              </div>
              <button
                className="pm-admin-sidebar-signout"
                onClick={() => {
                  clearStoredAuth();
                  setAuthUser(null);
                  navigate('/');
                }}
                title="Sign Out"
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ─── MAIN PANEL ─── */}
      <div className="menti-main-panel pm-admin-main-panel">
        {/* Top Navigation Bar */}
        <header className="menti-topbar pm-admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <button
              className="pm-admin-mobile-toggle"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              title="Toggle Sidebar Navigation"
              type="button"
            >
              ☰
            </button>
            <div className="pm-admin-topbar-breadcrumb">
              <span className="pm-admin-topbar-title">Student Academic Arena</span>
              <small style={{ fontSize: '0.75rem', color: '#64748B' }}>
                Pollmeter · Live Classroom Arena &amp; Analytics
              </small>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span
              className="pm-clearance-pill"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10B981',
                borderColor: 'rgba(16, 185, 129, 0.3)',
              }}
            >
              🎓 Student Clearance
            </span>

            {isFaculty && (
              <button
                className="pm-btn-mentor-switch"
                onClick={() => navigate('/dashboard')}
                title="Open Mentor Host Studio"
                type="button"
              >
                <span>👨‍🏫</span>
                <span>Host Studio</span>
              </button>
            )}

            <button
              className="pm-theme-toggle-btn"
              onClick={() => setTheme(toggleTheme())}
              type="button"
              title="Toggle Light / Dark mode"
              id="student-theme-toggle-btn"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="pm-admin-content">
          {/* Mentor Switch Notice if Faculty logs in */}
          {isFaculty && (
            <div
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '14px',
                padding: '1rem 1.25rem',
                marginBottom: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.4rem' }}>👨‍🏫</span>
                <div>
                  <strong style={{ color: '#60A5FA' }}>Faculty / Mentor Clearance Detected</strong>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mute, #94A3B8)' }}>
                    You are signed in with a Pollmeter Faculty account. You can create questions, launch live quizzes, and export gradebooks.
                  </p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/dashboard')}
                type="button"
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              >
                Open Host Studio →
              </button>
            </div>
          )}

          {/* ─── Hero: Live Classroom PIN Join Terminal Card ────────────────── */}
          <section
            ref={terminalRef}
            className="pm-admin-panel-card"
            style={{
              borderTop: '3.5px solid #F59E0B',
              marginBottom: '2rem',
              boxShadow: '0 8px 30px -4px rgba(0, 0, 0, 0.4), 0 0 20px rgba(245, 158, 11, 0.08)',
            }}
          >
            <div className="pm-panel-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                className="pm-kpi-icon-wrap"
                style={{
                  width: '44px',
                  height: '44px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#F59E0B',
                  fontSize: '1.3rem',
                  borderRadius: '12px',
                }}
              >
                🚀
              </div>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--fg, #F4F4F5)', letterSpacing: '-0.015em' }}>
                  Live Classroom Quiz Terminal
                </h2>
                <span style={{ fontSize: '0.82rem', color: 'var(--mute, #94A3B8)' }}>
                  Enter the 6-digit session PIN shown on your instructor&rsquo;s projector screen to join live.
                </span>
              </div>
            </div>

            <div className="pm-status-verified">
              <span className="pm-status-dot" />
              Live Server Active · Verified Attendance Ready
            </div>
          </div>

          <div style={{ padding: '1.5rem 1.75rem' }}>
            <form onSubmit={handleJoinSubmit}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '1.25rem' }}>
                {/* 6 Individual PIN Digit Boxes */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#F59E0B',
                      marginBottom: '0.5rem',
                    }}
                  >
                    6-Digit Session PIN
                  </label>
                  <div style={{ display: 'flex', gap: '0.45rem' }} onPaste={handlePaste}>
                    {digits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => { digitRefs.current[idx] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                        placeholder="•"
                        aria-label={`PIN Digit ${idx + 1}`}
                        style={{
                          width: '46px',
                          height: '52px',
                          textAlign: 'center',
                          fontSize: '1.5rem',
                          fontWeight: 800,
                          fontFamily: 'var(--mono, monospace)',
                          background: 'var(--bg, #0A0A0C)',
                          border: digit ? '2px solid #F59E0B' : '1.5px solid var(--border, #27272A)',
                          borderRadius: '10px',
                          color: '#F59E0B',
                          boxShadow: digit ? '0 0 12px rgba(245, 158, 11, 0.3)' : 'none',
                          outline: 'none',
                          transition: 'all 0.15s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Nickname input */}
                <div style={{ flex: '1', minWidth: '220px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--mute, #9CA3AF)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Participant Nickname
                  </label>
                  <input
                    type="text"
                    value={screenName}
                    onChange={(e) => setScreenName(e.target.value)}
                    placeholder="e.g. Alex (Leaderboard handle)"
                    maxLength={24}
                    style={{
                      width: '100%',
                      height: '52px',
                      padding: '0 1rem',
                      background: 'var(--bg, #0A0A0C)',
                      border: '1.5px solid var(--border, #27272A)',
                      borderRadius: '10px',
                      color: 'var(--fg, #F4F4F5)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  id="student-dashboard-join-btn"
                  className="btn btn-primary"
                  style={{
                    height: '52px',
                    padding: '0 1.75rem',
                    background: '#F59E0B',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '1rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 18px rgba(245, 158, 11, 0.35)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>Enter Live Arena</span>
                  <span style={{ fontSize: '1.15rem' }}>⚡</span>
                </button>
              </div>

              {pinError && (
                <div style={{ marginTop: '0.75rem', color: '#EF4444', fontSize: '0.85rem', fontWeight: 600 }}>
                  ⚠️ {pinError}
                </div>
              )}
            </form>
          </div>
        </section>

        {/* ─── Metric KPI Cards Grid ───────────────────────────────────────── */}
        <section className="pm-admin-kpi-grid">
          {/* KPI 1: Attended */}
          <div className="pm-kpi-card pm-kpi-card-blue">
            <div className="pm-kpi-icon-wrap">
              <span>📝</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Quizzes Attended</span>
              <div className="pm-kpi-val-row">
                <span className="pm-kpi-number">{stats.totalSessions}</span>
              </div>
              <span className="pm-kpi-caption">Verified classroom sessions</span>
            </div>
          </div>

          {/* KPI 2: Accuracy */}
          <div className="pm-kpi-card pm-kpi-card-emerald">
            <div className="pm-kpi-icon-wrap">
              <span>🎯</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Overall Accuracy</span>
              <div className="pm-kpi-val-row">
                <span className="pm-kpi-number">{stats.accuracy}%</span>
              </div>
              <span className="pm-kpi-caption">
                {stats.totalCorrect} of {stats.totalQuestions} questions correct
              </span>
            </div>
          </div>

          {/* KPI 3: Best Rank */}
          <div className="pm-kpi-card pm-kpi-card-amber">
            <div className="pm-kpi-icon-wrap">
              <span>🏆</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Best Placement</span>
              <div className="pm-kpi-val-row">
                <span className="pm-kpi-number">
                  {stats.bestRank ? `Rank #${stats.bestRank}` : '—'}
                </span>
              </div>
              <span className="pm-kpi-caption">
                {stats.podiumFinishes > 0 ? `${stats.podiumFinishes} top-3 podium finishes` : 'Join quizzes to rank'}
              </span>
            </div>
          </div>

          {/* KPI 4: Total Points */}
          <div className="pm-kpi-card pm-kpi-card-purple">
            <div className="pm-kpi-icon-wrap">
              <span>⚡</span>
            </div>
            <div className="pm-kpi-body">
              <span className="pm-kpi-label">Academic Points</span>
              <div className="pm-kpi-val-row">
                <span className="pm-kpi-number">{stats.totalScore.toLocaleString()}</span>
              </div>
              <span className="pm-kpi-caption">Cumulative speed &amp; accuracy score</span>
            </div>
          </div>
        </section>

        {/* ─── Active Subjects Pill Section ────────────────────────────────── */}
        {stats.subjectsList.length > 0 && (
          <section className="pm-admin-subjects-section" style={{ marginBottom: '1.5rem' }}>
            <span className="pm-subjects-heading">My Course Participation:</span>
            <div className="pm-subject-tags-list">
              {stats.subjectsList.map((sub, i) => (
                <div key={i} className="pm-subject-pill">
                  <span className="pm-subject-dot" />
                  <strong>{sub.name}</strong>
                  <span className="pm-subject-count">{sub.count} {sub.count === 1 ? 'quiz' : 'quizzes'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Filter Tabs Bar ─────────────────────────────────────────────── */}
        <div className="pm-admin-tabs-bar">
          <div className="pm-admin-tabs">
            <button
              className={`pm-admin-tab-btn ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
              type="button"
            >
              <span>📜 All Quiz Records</span>
              <span className="pm-tab-pill">{history.length}</span>
            </button>
            <button
              className={`pm-admin-tab-btn ${filterType === 'podium' ? 'active' : ''}`}
              onClick={() => setFilterType('podium')}
              type="button"
            >
              <span>🏆 Top Podiums (Rank 1–3)</span>
              <span className="pm-tab-pill">{stats.podiumFinishes}</span>
            </button>
          </div>

          <span className="pm-table-count">
            Showing <strong>{filteredHistory.length}</strong> record{filteredHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* ─── Past Quizzes & Journey Panel ─────────────────────────────────── */}
        <section className="pm-admin-panel-card">
          <div className="pm-panel-header-row">
            <div className="pm-search-input-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by subject, topic, or mentor name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="pm-search-clear" onClick={() => setSearchQuery('')} type="button">
                  ✕
                </button>
              )}
            </div>

            <span className="pm-table-count">
              Linked to <strong>{authUser?.email}</strong>
            </span>
          </div>

          {/* List Body */}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            {loading ? (
              <div className="pm-history-loading">
                <div className="spinner" />
                <p>Syncing your academic quiz records...</p>
              </div>
            ) : error ? (
              <div className="pm-auth-error-alert" style={{ margin: '0' }}>
                <span>⚠️ {error}</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="pm-history-empty">
                <span style={{ fontSize: '3rem' }}>🎯</span>
                <h3>{searchQuery ? 'No matching quiz records' : 'No quiz records found yet'}</h3>
                <p>
                  {searchQuery
                    ? 'Try searching with a different keyword or clearing the search query.'
                    : 'When your mentor launches an active session in class, enter the 6-digit PIN above to join! Your attendance and ranks will appear here automatically.'}
                </p>
              </div>
            ) : (
              <div className="pm-quizzes-card-list">
                {filteredHistory.map(({ session, participant }, idx) => {
                  const accuracy =
                    participant.totalQuestions > 0
                      ? Math.round((participant.correctCount / participant.totalQuestions) * 100)
                      : 0;
                  const isPodium = participant.rank && participant.rank <= 3;

                  return (
                    <div
                      key={participant.id || idx}
                      className="pm-student-history-card"
                      style={{
                        borderTop: isPodium ? '3.5px solid #F59E0B' : '3.5px solid #3B82F6',
                      }}
                    >
                      {/* Left: Rank & Session Details */}
                      <div className="pm-quiz-card-left">
                        <span
                          className={`pm-rank-pill ${
                            participant.rank === 1
                              ? 'pm-rank-gold'
                              : participant.rank === 2
                              ? 'pm-rank-silver'
                              : participant.rank === 3
                              ? 'pm-rank-bronze'
                              : ''
                          }`}
                          style={
                            participant.rank === 1
                              ? { background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#000000', fontWeight: 800 }
                              : undefined
                          }
                        >
                          {participant.rank === 1
                            ? '👑 Rank #1'
                            : participant.rank === 2
                            ? '🥈 Rank #2'
                            : participant.rank === 3
                            ? '🥉 Rank #3'
                            : `Rank #${participant.rank || '—'}`}
                        </span>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                            <h4 className="pm-quiz-card-topic">
                              {session.topic || 'Classroom Quiz Session'}
                            </h4>
                            <span className="pm-subject-badge">
                              {session.subject || 'General'}
                            </span>
                            <span className="pm-batch-badge">
                              🎓 {session.batch || participant.batch || 'Batch'}
                            </span>
                          </div>

                          <span className="pm-quiz-card-date">
                            👨‍🏫 Mentor: <strong style={{ color: 'var(--fg, #F4F4F5)' }}>{session.hostName || 'Faculty'}</strong> • Played as &ldquo;<strong style={{ color: '#F59E0B' }}>{participant.screenName}</strong>&rdquo; • {session.createdAt ? new Date(session.createdAt).toLocaleDateString() : 'Recent'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Scores & Stats */}
                      <div className="pm-quiz-card-right">
                        <div className="pm-quiz-card-stat">
                          <span className="pm-stat-num" style={{ color: '#F59E0B' }}>
                            {participant.finalScore || 0}
                          </span>
                          <span className="pm-stat-label">Points</span>
                        </div>

                        <div className="pm-quiz-card-stat">
                          <span className="pm-stat-num" style={{ color: accuracy >= 70 ? '#10B981' : '#60A5FA' }}>
                            {accuracy}%
                          </span>
                          <span className="pm-stat-label">
                            {participant.correctCount || 0}/{participant.totalQuestions || 0} Right
                          </span>
                        </div>

                        <span className="pm-status-verified">
                          <span className="pm-status-dot" />
                          Recorded
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
      </div>
    </div>
  );
}
