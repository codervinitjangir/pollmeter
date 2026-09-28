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

  // Quiz history & analytics
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'podium' | 'recent'>('all');

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

    for (const item of history) {
      const p = item.participant || {};
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
    }

    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    return {
      totalSessions,
      totalScore,
      totalCorrect,
      totalQuestions,
      accuracy,
      bestRank,
      podiumFinishes,
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
    <div className="pm-admin-layout" style={{ minHeight: '100vh', background: 'var(--bg, #09090B)' }}>
      {/* College Auth Modal if student is not logged in */}
      <CollegeAuthModal
        isOpen={showAuthModal || !authUser}
        title="Medhavi Student Portal Login"
        subtitle="Sign in with your official @medhaviskillsuniversity.edu.in account to view your quiz scores and attendance."
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

      {/* Top Navigation Bar */}
      <header className="pm-admin-topbar" style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>
        <div className="pm-admin-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: '#16161D',
              border: '1.5px solid #F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(245, 158, 11, 0.35)',
              color: '#F59E0B',
              fontSize: '1.3rem',
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pm-admin-title" style={{ letterSpacing: '-0.02em', fontWeight: 800 }}>Polaris Campus</span>
              <span
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#F59E0B',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                }}
              >
                STUDENT PORTAL
              </span>
            </div>
            <span className="pm-admin-sub" style={{ color: 'var(--mute, #8B8B94)' }}>
              Medhavi Skills University · Live Classroom Arena &amp; Academic Analytics
            </span>
          </div>
        </div>

        <div className="pm-admin-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Theme Toggle */}
          <button
            className="pm-theme-toggle-btn"
            onClick={() => setTheme(toggleTheme())}
            type="button"
            title="Toggle Light / Dark mode"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          {/* Student Profile Info */}
          {authUser ? (
            <div className="pm-admin-profile" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#16161D',
                  border: '1.5px solid #F59E0B',
                  color: '#F59E0B',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {authUser.realName.slice(0, 2).toUpperCase()}
              </div>
              <div className="pm-admin-profile-text">
                <strong style={{ color: 'var(--fg, #F4F4F5)' }}>{authUser.realName}</strong>
                <small style={{ color: '#F59E0B' }}>
                  🎓 MSU Verified ({authUser.email.split('@')[0]})
                </small>
              </div>
              <button
                className="pm-admin-signout-btn"
                onClick={() => {
                  clearStoredAuth();
                  setAuthUser(null);
                  navigate('/');
                }}
                type="button"
                style={{ color: '#EF4444', fontWeight: 700 }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              className="pm-btn-primary"
              onClick={() => setShowAuthModal(true)}
              type="button"
              style={{ background: '#F59E0B', color: '#000000', fontWeight: 800 }}
            >
              Sign In with College ID
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pm-admin-content" style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {/* Mentor Switch Notice if Faculty logs in */}
        {isFaculty && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '14px',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
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
                  You are signed in with a Polaris Faculty account. You can create questions, launch live quizzes, and export gradebooks.
                </p>
              </div>
            </div>
            <button
              className="pm-btn-primary"
              onClick={() => navigate('/dashboard')}
              type="button"
              style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
            >
              Open Host Studio →
            </button>
          </div>
        )}

        {/* ─── Hero: Live Classroom PIN Join Terminal ────────────────────── */}
        <section
          style={{
            background: 'var(--panel, #121217)',
            border: '1.5px solid rgba(245, 158, 11, 0.35)',
            borderTop: '4px solid #F59E0B',
            borderRadius: '20px',
            padding: '2rem',
            marginBottom: '2.5rem',
            boxShadow: '0 12px 36px -8px rgba(0, 0, 0, 0.5), 0 0 24px rgba(245, 158, 11, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>🚀</span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--fg, #F4F4F5)', letterSpacing: '-0.02em' }}>
                  Join Live Classroom Quiz
                </h2>
              </div>
              <p style={{ margin: '0.35rem 0 0', color: 'var(--mute, #9CA3AF)', fontSize: '0.9rem' }}>
                Enter the 6-digit session PIN shown on your instructor&rsquo;s projector screen to race in real-time.
              </p>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                color: '#10B981',
                fontWeight: 700,
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
              Live Server Active · Verified Attendance Ready
            </div>
          </div>

          <form onSubmit={handleJoinSubmit}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '1.5rem' }}>
              {/* PIN boxes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#F59E0B', marginBottom: '0.5rem' }}>
                  6-Digit Session PIN
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }} onPaste={handlePaste}>
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
                      style={{
                        width: '48px',
                        height: '56px',
                        textAlign: 'center',
                        fontSize: '1.6rem',
                        fontWeight: 800,
                        fontFamily: 'var(--mono, monospace)',
                        background: 'var(--bg, #0A0A0C)',
                        border: digit ? '2px solid #F59E0B' : '1.5px solid var(--border, #27272A)',
                        borderRadius: '12px',
                        color: '#F59E0B',
                        boxShadow: digit ? '0 0 12px rgba(245, 158, 11, 0.3)' : 'none',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Screen name input */}
              <div style={{ flex: '1', minWidth: '220px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mute, #9CA3AF)', marginBottom: '0.5rem' }}>
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
                    height: '56px',
                    padding: '0 1.15rem',
                    background: 'var(--bg, #0A0A0C)',
                    border: '1.5px solid var(--border, #27272A)',
                    borderRadius: '12px',
                    color: 'var(--fg, #F4F4F5)',
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                id="student-dashboard-join-btn"
                style={{
                  height: '56px',
                  padding: '0 2rem',
                  background: '#F59E0B',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>Enter Live Arena</span>
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
              </button>
            </div>

            {pinError && (
              <div style={{ marginTop: '0.85rem', color: '#EF4444', fontSize: '0.88rem', fontWeight: 600 }}>
                ⚠️ {pinError}
              </div>
            )}
          </form>
        </section>

        {/* ─── Metric KPI Cards ────────────────────────────────────────────── */}
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

        {/* ─── Past Quizzes & Attendance Journey ───────────────────────────── */}
        <section
          style={{
            background: 'var(--panel, #121217)',
            border: '1px solid var(--border, #1F1F24)',
            borderRadius: '20px',
            padding: '1.75rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border, #1F1F24)', paddingBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>📜</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--fg, #F4F4F5)' }}>
                  My Quiz Journey &amp; Attendance Records
                </h3>
              </div>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--mute, #8B8B94)', fontSize: '0.85rem' }}>
                Individual performance ledger linked to your official Medhavi University identity.
              </p>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Filter by subject or topic..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    height: '36px',
                    padding: '0 0.85rem',
                    background: 'var(--bg, #0A0A0C)',
                    border: '1px solid var(--border, #27272A)',
                    borderRadius: '8px',
                    color: 'var(--fg, #F4F4F5)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    minWidth: '220px',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setFilterType('all')}
                style={{
                  height: '36px',
                  padding: '0 0.85rem',
                  borderRadius: '8px',
                  border: filterType === 'all' ? '1px solid #F59E0B' : '1px solid var(--border, #27272A)',
                  background: filterType === 'all' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: filterType === 'all' ? '#F59E0B' : 'var(--mute, #8B8B94)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                All ({history.length})
              </button>

              <button
                type="button"
                onClick={() => setFilterType('podium')}
                style={{
                  height: '36px',
                  padding: '0 0.85rem',
                  borderRadius: '8px',
                  border: filterType === 'podium' ? '1px solid #F59E0B' : '1px solid var(--border, #27272A)',
                  background: filterType === 'podium' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: filterType === 'podium' ? '#F59E0B' : 'var(--mute, #8B8B94)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                🏆 Top Podiums ({stats.podiumFinishes})
              </button>
            </div>
          </div>

          {/* List Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
              <div className="pm-spinner" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--mute, #8B8B94)', margin: 0 }}>Syncing your academic quiz records...</p>
            </div>
          ) : error ? (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '1.25rem', color: '#EF4444' }}>
              ⚠️ {error}
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
              <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🎯</span>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 0.5rem', color: 'var(--fg, #F4F4F5)' }}>
                {searchQuery ? 'No matching quiz records found' : 'No quiz records yet'}
              </h4>
              <p style={{ maxWidth: '440px', margin: '0 auto', color: 'var(--mute, #8B8B94)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                {searchQuery
                  ? 'Try searching with a different keyword or clear the search filter.'
                  : 'When your mentor launches an active session in class, enter the 6-digit PIN above to join. Your scores, rank, and attendance will appear here automatically!'}
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
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      padding: '1.25rem 1.5rem',
                      borderRadius: '14px',
                    }}
                  >
                    {/* Left: Rank & Session Details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flex: '1', minWidth: '280px' }}>
                      <span
                        className="pm-rank-pill"
                        style={{
                          background:
                            participant.rank === 1
                              ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                              : participant.rank === 2
                              ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                              : participant.rank === 3
                              ? 'linear-gradient(135deg, #D97706, #B45309)'
                              : 'rgba(245, 158, 11, 0.1)',
                          color: participant.rank && participant.rank <= 3 ? '#000000' : '#F59E0B',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                        }}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--fg, #F4F4F5)' }}>
                            {session.topic || 'Classroom Quiz Session'}
                          </h4>
                          <span
                            className="pm-subject-badge"
                            style={{
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#60A5FA',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                            }}
                          >
                            {session.subject || 'General'}
                          </span>
                          <span
                            className="pm-batch-badge"
                            style={{
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10B981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.5rem',
                              borderRadius: '6px',
                            }}
                          >
                            🎓 {session.batch || participant.batch || 'Batch'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--mute, #8B8B94)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>👨‍🏫 Mentor: <strong style={{ color: 'var(--fg, #F4F4F5)' }}>{session.hostName || 'Faculty'}</strong></span>
                          <span>•</span>
                          <span>Played as &ldquo;<strong style={{ color: '#F59E0B' }}>{participant.screenName}</strong>&rdquo;</span>
                          <span>•</span>
                          <span>📅 {session.createdAt ? new Date(session.createdAt).toLocaleDateString() : 'Recent'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Scores & Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div className="pm-quiz-card-stat" style={{ textAlign: 'right' }}>
                        <span className="pm-stat-num" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#F59E0B' }}>
                          {participant.finalScore || 0}
                        </span>
                        <span className="pm-stat-label" style={{ fontSize: '0.72rem', color: 'var(--mute, #8B8B94)' }}>
                          Points
                        </span>
                      </div>

                      <div className="pm-quiz-card-stat" style={{ textAlign: 'right' }}>
                        <span className="pm-stat-num" style={{ fontSize: '1.25rem', fontWeight: 800, color: accuracy >= 70 ? '#10B981' : '#60A5FA' }}>
                          {accuracy}%
                        </span>
                        <span className="pm-stat-label" style={{ fontSize: '0.72rem', color: 'var(--mute, #8B8B94)' }}>
                          {participant.correctCount || 0}/{participant.totalQuestions || 0} Right
                        </span>
                      </div>

                      <div
                        style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10B981',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        ✅ Recorded
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
