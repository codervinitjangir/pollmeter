import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import socket from '../socket';
import {
  Question,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  QuestionChangedPayload,
  ResultsUpdatedPayload,
  SessionEndedPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  TimerStartedPayload,
  Participant,
  ParticipantsUpdatedPayload,
} from '../types';
import QuestionForm from '../components/QuestionForm';
import QRCodeDisplay from '../components/QRCodeDisplay';
import LiveBarChart from '../components/LiveBarChart';
import TextResponseList from '../components/TextResponseList';
import CountdownTimer from '../components/CountdownTimer';
import Leaderboard from '../components/Leaderboard';
import AIGenerateModal from '../components/AIGenerateModal';

type HostStep = 'build' | 'lobby' | 'active' | 'leaderboard' | 'ended';

export default function HostPage() {
  const [step, setStep] = useState<HostStep>('build');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [code, setCode] = useState('');
  const [hostId, setHostId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiInitialTopic, setAiInitialTopic] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const builderRef = useRef<HTMLDivElement>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lanIp, setLanIp] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; drift: number }>>([]);
  const [showAnswer, setShowAnswer] = useState(false);

  // Active state
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalQ, setTotalQ] = useState(0);
  const [liveResults, setLiveResults] = useState<AggregatedResult | null>(null);
  const [timer, setTimer] = useState<{ startedAt: number; durationSeconds: number } | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbQuestionId, setLbQuestionId] = useState('');
  const [lbCorrectAnswer, setLbCorrectAnswer] = useState<string | undefined>();

  // 5-second auto-advance on leaderboard (Rule 8)
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState(5);
  const [isAutoPaused, setIsAutoPaused] = useState(false);

  // Final
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);

  // Check network info
  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.json())
      .then((d) => {
        if (d.localIp && d.localIp !== 'localhost') setLanIp(d.localIp);
      })
      .catch(() => {});
  }, []);

  // Socket setup
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on('question_changed', (p: QuestionChangedPayload) => {
      setCurrentQuestion(p.question);
      setCurrentIndex(p.index);
      setLiveResults(null);
      setShowAnswer(false);
      setStep('active');
      setTimer({ startedAt: p.timerStartedAt, durationSeconds: p.question.timeLimitSeconds });
    });

    socket.on('results_updated', (p: ResultsUpdatedPayload) => setLiveResults(p.aggregated));

    socket.on('timer_started', (p: TimerStartedPayload) => {
      setTimer({ startedAt: p.startedAt, durationSeconds: p.durationSeconds });
    });

    socket.on('leaderboard_updated', (p: LeaderboardPayload) => {
      setLeaderboard(p.leaderboard);
      setLbQuestionId(p.questionId);
      setLbCorrectAnswer(p.correctAnswer);
      setStep('leaderboard');
    });

    socket.on('session_ended', (p: SessionEndedPayload) => {
      setFinalData(p);
      setLeaderboard(p.leaderboard);
      setStep('ended');
    });

    socket.on('participants_updated', (p: ParticipantsUpdatedPayload) => {
      setParticipants(p.participants);
    });

    socket.on('reaction_received', (p: { emoji: string; id: string }) => {
      const drift = (Math.random() - 0.5) * 80;
      setReactions((prev) => [...prev.slice(-12), { id: p.id, emoji: p.emoji, drift }]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== p.id));
      }, 2500);
    });

    socket.on('error', (p: { message: string }) => {
      setError(p.message);
      setLoading(false);
    });

    return () => {
      socket.off('question_changed');
      socket.off('results_updated');
      socket.off('timer_started');
      socket.off('leaderboard_updated');
      socket.off('session_ended');
      socket.off('participants_updated');
      socket.off('reaction_received');
      socket.off('error');
    };
  }, []);

  // ─── Build ────────────────────────────────────────────────────────────────
  function addQuestions(qs: Question[]) {
    setQuestions((prev) => [...prev, ...qs]);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  async function createSession() {
    setError('');
    if (questions.length === 0) { setError('Add at least one question.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const d: { code: string; hostId: string } = await res.json();
      setCode(d.code);
      setHostId(d.hostId);
      setTotalQ(questions.length);
      setStep('lobby');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed.');
    } finally { setLoading(false); }
  }

  const startSession = useCallback(() => {
    setError('');
    socket.emit('host_start_session', { code, hostId });
  }, [code, hostId]);

  const nextQuestion = useCallback(() => {
    setError('');
    socket.emit('host_next_question', { code, hostId });
  }, [code, hostId]);

  // ─── Auto-advance 5s timer on Leaderboard (Rule 8) ───────────────────────
  useEffect(() => {
    if (step !== 'leaderboard') return;
    setAutoAdvanceTimer(5);
    setIsAutoPaused(false);
  }, [step, lbQuestionId]);

  useEffect(() => {
    if (step !== 'leaderboard' || isAutoPaused) return;

    const interval = setInterval(() => {
      setAutoAdvanceTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          nextQuestion();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, isAutoPaused, nextQuestion]);

  // ─── CSV Export for ended screen ──────────────────────────────────────────
  function exportResultsCsv() {
    if (!leaderboard || leaderboard.length === 0) return;

    const headers = ['Rank', 'Student Name', 'Total Score (pts)', 'Correct Answers'];
    const rows = leaderboard.map((entry) => [
      entry.rank,
      `"${entry.name.replace(/"/g, '""')}"`,
      entry.totalScore,
      entry.correctAnswers,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PollMeter_Results_${code || 'Quiz'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const port = window.location.port ? `:${window.location.port}` : '';
  const joinHost = lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? `${lanIp}${port}`
    : window.location.host;
  const joinUrl = `${window.location.protocol}//${joinHost}/join?code=${code}`;

  function copyJoinLink() {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  const answeredCount = liveResults
    ? currentQuestion?.type === 'mcq'
      ? Object.values(liveResults as McqAggregated).reduce((a, b) => a + b, 0)
      : Array.isArray(liveResults) ? (liveResults as TextAggregated).length : 0
    : 0;

  function scrollToBuilder() {
    builderRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function openWithTopic(topicPrompt: string) {
    setAiInitialTopic(topicPrompt);
    setShowAI(true);
  }

  // ─── Renders ──────────────────────────────────────────────────────────────

  if (step === 'build') return (
    <div className="menti-app-shell">
      {/* ─── Left Sidebar ──────────────────────────────────────────────── */}
      <aside className="menti-sidebar">
        <div>
          <a href="/host" className="menti-sidebar-brand">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9H11V27H6V9Z" fill="#191C21" />
              <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
              <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', color: '#191C21' }}>PollMeter</span>
          </a>

          <button
            className="menti-btn-new"
            onClick={scrollToBuilder}
            id="new-menti-btn"
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> New Menti
          </button>

          <nav className="menti-nav-group">
            <button
              className={`menti-nav-link ${activeNav === 'home' ? 'active' : ''}`}
              onClick={() => setActiveNav('home')}
            >
              <span>🏠</span> Home
            </button>
            <button
              className={`menti-nav-link ${activeNav === 'recents' ? 'active' : ''}`}
              onClick={() => setActiveNav('recents')}
            >
              <span>🕒</span> Recents
            </button>
            <button
              className={`menti-nav-link ${activeNav === 'my-mentis' ? 'active' : ''}`}
              onClick={() => setActiveNav('my-mentis')}
            >
              <span>👤</span> My Mentis
            </button>
            <button
              className={`menti-nav-link ${activeNav === 'shared' ? 'active' : ''}`}
              onClick={() => setActiveNav('shared')}
            >
              <span>✉️</span> Shared with me
            </button>
          </nav>

          <div className="menti-nav-group">
            <div className="menti-nav-title">WORKSPACE</div>
            <button
              className={`menti-nav-link ${activeNav === 'team' ? 'active' : ''}`}
              onClick={() => setActiveNav('team')}
            >
              <span>📁</span> Workspace Mentis
            </button>
            <button
              className={`menti-nav-link ${activeNav === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveNav('templates')}
            >
              <span>📋</span> Shared templates
            </button>
          </div>
        </div>

        <div className="menti-sidebar-footer">
          <button className="menti-nav-link" onClick={scrollToBuilder}><span>🎨</span> Templates</button>
          <button className="menti-nav-link" onClick={scrollToBuilder}><span>🔌</span> Integrations</button>
          <button className="menti-nav-link" onClick={scrollToBuilder}><span>📖</span> Tutorials</button>
          <button className="menti-nav-link" onClick={scrollToBuilder}><span>❓</span> Help</button>
          <button className="menti-nav-link" onClick={() => setQuestions([])}><span>🗑️</span> Trash</button>
        </div>
      </aside>

      {/* ─── Main Content Shell ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
        {/* Topbar */}
        <header className="menti-topbar">
          <div className="menti-search">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search Mentis, folders, and pages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="menti-topbar-actions">
            <button className="btn btn-upgrade btn--sm" onClick={() => alert('PollMeter Classroom Edition — Free & Open Source')}>
              ★ Upgrade
            </button>
            <button className="btn btn-ghost btn--icon" title="Notifications" style={{ borderRadius: '50%', width: '36px', height: '36px' }}>
              🔔
            </button>
            <div className="menti-avatar" title="Mentor Profile">
              SK
            </div>
          </div>
        </header>

        {showAI && (
          <AIGenerateModal
            onInsert={(qs) => {
              addQuestions(qs);
              setShowAI(false);
              setTimeout(scrollToBuilder, 200);
            }}
            onClose={() => setShowAI(false)}
            initialTopic={aiInitialTopic}
          />
        )}

        {/* Dashboard Main Area */}
        <main className="menti-content">
          <h1 className="menti-welcome-title">Welcome to the new PollMeter</h1>

          {/* Hero Row: Live Card + Mini Cards */}
          <section className="menti-hero-row">
            {/* Live Featured Card */}
            <div className="menti-card-live">
              <div>
                <div className="menti-live-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#3B82F6" />
                    <circle cx="12" cy="12" r="5" fill="#FFFFFF" />
                  </svg>
                  <span>Live</span>
                </div>

                <h2 className="menti-live-headline">
                  MENTI IN THE<br />MOMENT
                </h2>

                <p className="menti-live-desc">
                  Engage your audience with live polls, quizzes, word clouds, and Q&A.
                </p>
              </div>

              <div>
                <button
                  className="menti-btn-presentation"
                  onClick={scrollToBuilder}
                  id="make-presentation-btn"
                >
                  Make a presentation →
                </button>
              </div>

              {/* Decorative Right Collage Art */}
              <div className="menti-live-art" aria-hidden="true">
                <svg width="210" height="170" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="90" cy="90" r="55" stroke="#3B82F6" strokeWidth="18" strokeDasharray="160 110" opacity="0.8" />
                  <rect x="95" y="25" width="115" height="130" rx="18" fill="#1E293B" />
                  <rect x="110" y="45" width="85" height="12" rx="4" fill="#38BDF8" />
                  <rect x="110" y="70" width="60" height="8" rx="3" fill="#64748B" />
                  <rect x="110" y="90" width="85" height="6" rx="3" fill="#475569" />
                  <rect x="110" y="105" width="45" height="6" rx="3" fill="#475569" />
                  <circle cx="170" cy="125" r="14" fill="#3B82F6" />
                  <circle cx="65" cy="130" r="22" fill="#FACC15" />
                  <text x="65" y="136" textAnchor="middle" fontSize="16">👩‍🏫</text>
                </svg>
              </div>
            </div>

            {/* Mini Card 1: Form */}
            <div className="menti-card-mini">
              <div className="menti-mini-badge">
                <span style={{ color: '#6366F1', fontSize: '1.2rem' }}>◆</span>
                <span>Form</span>
                <span className="menti-mini-tag">Beta</span>
              </div>
              <p className="menti-mini-desc">Surveys people want to answer</p>
              <button
                className="menti-mini-arrow"
                onClick={() => openWithTopic('Student course feedback survey')}
                aria-label="Create Survey Form"
              >
                →
              </button>
            </div>

            {/* Mini Card 2: Pulse */}
            <div className="menti-card-mini">
              <div className="menti-mini-badge">
                <span style={{ color: '#EC4899', fontSize: '1.2rem' }}>●</span>
                <span>Pulse</span>
                <span className="menti-mini-tag">Beta</span>
              </div>
              <p className="menti-mini-desc">Continuous classroom & student feedback</p>
              <button
                className="menti-mini-arrow"
                onClick={() => openWithTopic('Classroom learning pulse check')}
                aria-label="Create Pulse Check"
              >
                →
              </button>
            </div>
          </section>

          {/* Start with AI Section */}
          <section style={{ marginBottom: '2.5rem' }}>
            <div className="menti-ai-header">
              <span>Start with AI</span>
              <span style={{ color: '#8B5CF6' }}>✨</span>
            </div>

            <div className="menti-ai-grid">
              <div
                className="menti-ai-box"
                onClick={() => openWithTopic('Fun icebreaker questions and trivia to energize the room')}
                role="button"
                tabIndex={0}
              >
                <span className="menti-ai-icon">🖼️</span>
                <span className="menti-ai-label">Energize the room</span>
              </div>

              <div
                className="menti-ai-box"
                onClick={() => openWithTopic('Group decision making and priority voting poll')}
                role="button"
                tabIndex={0}
              >
                <span className="menti-ai-icon">↗️</span>
                <span className="menti-ai-label">Make decisions</span>
              </div>

              <div
                className="menti-ai-box"
                onClick={() => openWithTopic('Live interactive feedback and understanding check')}
                role="button"
                tabIndex={0}
              >
                <span className="menti-ai-icon">🎙️</span>
                <span className="menti-ai-label">Get live feedback</span>
              </div>

              <div
                className="menti-ai-box"
                onClick={() => openWithTopic('Quick classroom mood and knowledge check-in')}
                role="button"
                tabIndex={0}
              >
                <span className="menti-ai-icon">📊</span>
                <span className="menti-ai-label">Check-in</span>
              </div>

              <div
                className="menti-ai-box"
                onClick={() => openWithTopic('Open brainstorm and idea generation on key topics')}
                role="button"
                tabIndex={0}
              >
                <span className="menti-ai-icon">💡</span>
                <span className="menti-ai-label">Brainstorm ideas</span>
              </div>
            </div>
          </section>

          {/* Session & Slide Builder Area */}
          <section ref={builderRef} style={{ scrollMarginTop: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 className="t-title" style={{ fontSize: '1.35rem' }}>Interactive Question Builder</h3>
                <p className="t-body-sm text-secondary">
                  Create scored multiple choice quizzes or open-text prompts.
                </p>
              </div>
              <button
                className="btn btn-ai btn--sm"
                onClick={() => openWithTopic('')}
                id="open-ai-builder-btn"
              >
                ✨ AI Generate
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: questions.length > 0 ? '1.8fr 1.2fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
              {/* Question Form */}
              <div className="card card--lg" style={{ borderRadius: '20px' }}>
                <p className="t-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>➕</span> Add a Question
                </p>
                <QuestionForm onSave={(q) => addQuestions([q])} />
              </div>

              {/* Questions Slide Deck */}
              {questions.length > 0 && (
                <div className="card stack stack-4" style={{ borderRadius: '20px' }}>
                  <div className="row row-3" style={{ justifyContent: 'space-between' }}>
                    <p className="t-title">Session Slides</p>
                    <span className="badge badge-primary">{questions.length} Slide{questions.length !== 1 ? 's' : ''}</span>
                  </div>

                  <div className="stack stack-3" style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {questions.map((q, idx) => (
                      <div key={q.id} className="card card--sm row row-3" style={{ alignItems: 'flex-start', background: '#FFFFFF' }}>
                        <div className="flex-1 stack stack-2">
                          <div className="row row-2 row-wrap">
                            <span className="badge badge-neutral t-label-sm">#{idx + 1}</span>
                            <span className={`badge t-label-sm ${q.type === 'mcq' ? 'badge-primary' : 'badge-success'}`}>
                              {q.type === 'mcq' ? 'MCQ' : 'Open Text'}
                            </span>
                            <span className="badge badge-warning t-label-sm">⏱ {q.timeLimitSeconds}s</span>
                            {q.correctAnswer && <span className="badge badge-success t-label-sm">✓ Quiz</span>}
                          </div>
                          <p className="t-body-md text-primary" style={{ fontWeight: 600 }}>{q.text}</p>
                          {q.options && (
                            <p className="t-body-sm text-muted">{q.options.join(' · ')}</p>
                          )}
                        </div>
                        <button
                          className="btn btn-ghost btn--icon btn--sm"
                          onClick={() => removeQuestion(q.id)}
                          aria-label="Remove question"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {error && <div className="alert alert-error">⚠ {error}</div>}

                  <button
                    className="btn btn-primary btn--lg btn--full"
                    onClick={createSession}
                    disabled={loading || questions.length === 0}
                    id="create-session-btn"
                  >
                    {loading ? (
                      <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Creating Session…</>
                    ) : (
                      `🚀 Launch Session (${questions.length} Question${questions.length !== 1 ? 's' : ''})`
                    )}
                  </button>
                </div>
              )}
            </div>

            {questions.length === 0 && (
              <div className="card text-center stack stack-3" style={{ padding: '2.5rem', background: '#FFFFFF', borderRadius: '20px', marginTop: '1.5rem' }}>
                <p className="t-body-md text-secondary">
                  💡 No questions in this presentation yet. Add your question above or click any of the <strong>Start with AI ✨</strong> cards above to generate a full interactive quiz instantly!
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );

  if (step === 'lobby') return (
    <div className="page">
      <nav className="nav">
        <span className="nav-logo">
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9H11V27H6V9Z" fill="#191C21" />
            <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
            <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
          </svg>
          <span style={{ fontWeight: 800, color: '#191C21' }}>PollMeter</span>
        </span>
        <div className="row row-3">
          <span className="badge badge-warning t-label-sm">Waiting for participants</span>
          <span className="chip">👥 {participants.length} Joined</span>
        </div>
      </nav>
      <div className="main-content">
        <div className="container--narrow" style={{ margin: '0 auto' }}>
          <div className="stack stack-6">
            <div className="text-center stack stack-2">
              <h1 className="t-headline">Session Ready!</h1>
              <p className="t-body-md text-secondary">
                Audience can scan with their phone camera or enter code on laptop
              </p>
            </div>

            <QRCodeDisplay url={joinUrl} code={code} />

            {/* Quick copy link & LAN tip */}
            <div className="row row-2" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary btn--sm" onClick={copyJoinLink} id="copy-link-btn">
                {copied ? '✓ Copied Link!' : '📋 Copy Join Link'}
              </button>
            </div>

            {/* Real-time participant lobby */}
            <div className="card stack stack-3 text-center" style={{ background: 'var(--surface-low)' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="t-label-md">👥 Participants in lobby:</span>
                <span className="badge badge-primary">{participants.length}</span>
              </div>
              {participants.length === 0 ? (
                <p className="t-body-sm text-muted">Waiting for people to join with code {code}…</p>
              ) : (
                <div className="row row-2 row-wrap" style={{ justifyContent: 'center' }}>
                  {participants.map((p) => (
                    <span key={p.id} className="badge badge-neutral" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                      👤 {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">⚠ {error}</div>}

            <button className="btn btn-success btn--lg btn--full" onClick={startSession} id="start-session-btn">
              ▶ Start Session · {totalQ} Question{totalQ !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (step === 'active') return (
    <div className="page">
      <nav className="nav">
        <span className="nav-logo">
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9H11V27H6V9Z" fill="#191C21" />
            <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
            <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
          </svg>
          <span style={{ fontWeight: 800, color: '#191C21' }}>PollMeter</span>
        </span>
        <div className="row row-3">
          <span className="badge badge-live">Live</span>
          <span className="chip">🔑 Code: {code}</span>
          <button className="btn btn-ghost btn--sm" onClick={toggleFullscreen} id="fullscreen-btn">
            {isFullscreen ? '✕ Exit' : '⛶ Projector Mode'}
          </button>
        </div>
      </nav>
      <div className="main-content">
        <div className="container--wide" style={{ margin: '0 auto' }}>
          <div className="stack stack-5">
            {/* Classroom Join Banner for Screen */}
            <div className="card card--sm row row-3" style={{ background: 'var(--surface-low)', justifyContent: 'space-between', padding: '0.65rem 1.25rem' }}>
              <div className="row row-2">
                <span className="badge badge-primary">📱 Join</span>
                <span className="t-body-sm text-secondary">
                  Go to <strong style={{ color: 'var(--primary)' }}>{joinHost}/join</strong> · Code: <strong style={{ color: 'var(--primary)', letterSpacing: '0.05em' }}>{code}</strong>
                </span>
              </div>
              <span className="t-label-sm text-muted">
                📝 {answeredCount} of {participants.length || '—'} students answered
              </span>
            </div>

            {/* Progress */}
            <div className="stack stack-2">
              <div className="row row-3" style={{ justifyContent: 'space-between' }}>
                <span className="t-label-sm text-muted">QUESTION {currentIndex + 1} OF {totalQ}</span>
                <span className="t-label-sm text-muted">{totalQ - currentIndex - 1} remaining</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${((currentIndex + 1) / totalQ) * 100}%` }} />
              </div>
            </div>

            {currentQuestion && (
              <div className="card card--lg stack stack-5">
                {/* Header row */}
                <div className="row row-3" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h1 className="t-headline flex-1" style={{ fontSize: 'clamp(1.25rem, 3vw, 1.85rem)', lineHeight: 1.3 }}>
                    {currentQuestion.text}
                  </h1>
                  {timer && (
                    <CountdownTimer
                      durationSeconds={timer.durationSeconds}
                      startedAt={timer.startedAt}
                      size={76}
                    />
                  )}
                </div>

                <hr className="divider" />

                {/* Live results */}
                {currentQuestion.type === 'mcq' ? (
                  <LiveBarChart
                    aggregated={(liveResults ?? {}) as McqAggregated}
                    correctAnswer={showAnswer ? currentQuestion.correctAnswer : undefined}
                  />
                ) : (
                  <TextResponseList responses={Array.isArray(liveResults) ? liveResults as TextAggregated : []} />
                )}
              </div>
            )}

            {/* Answer reveal status */}
            {showAnswer && currentQuestion?.correctAnswer && (
              <div className="alert alert-success row row-2" style={{ justifyContent: 'center', fontSize: '1.05rem', padding: '0.9rem' }}>
                <span>✓</span>
                <span>Correct Answer: <strong>{currentQuestion.correctAnswer}</strong></span>
              </div>
            )}

            {error && <div className="alert alert-error">⚠ {error}</div>}

            <div className="row row-3" style={{ justifyContent: 'flex-end' }}>
              {currentQuestion?.correctAnswer && !showAnswer && (
                <button
                  className="btn btn-secondary btn--lg"
                  onClick={() => setShowAnswer(true)}
                  id="reveal-answer-btn"
                >
                  ✓ Reveal Answer
                </button>
              )}
              <button
                className={`btn btn--lg ${currentIndex >= totalQ - 1 ? 'btn-danger' : 'btn-primary'}`}
                onClick={nextQuestion}
                id="next-question-btn"
              >
                {currentIndex >= totalQ - 1 ? '🏁 End Quiz & Show Winners' : '🏆 Show Leaderboard →'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating live classroom reactions */}
      {reactions.map((r) => (
        <span
          key={r.id}
          className="floating-reaction"
          style={{ '--drift': `${r.drift}px` } as React.CSSProperties}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );

  if (step === 'leaderboard') return (
    <div className="page">
      <nav className="nav">
        <span className="nav-logo">
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9H11V27H6V9Z" fill="#191C21" />
            <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
            <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
          </svg>
          <span style={{ fontWeight: 800, color: '#191C21' }}>PollMeter</span>
        </span>
        <div className="row row-3">
          <span className="badge badge-live">Live</span>
          <span className="chip">Q{currentIndex + 1}/{totalQ}</span>
          <button className="btn btn-ghost btn--sm" onClick={toggleFullscreen}>
            {isFullscreen ? '✕ Exit' : '⛶ Projector Mode'}
          </button>
        </div>
      </nav>
      <div className="main-content">
        <div className="container stack stack-6" style={{ margin: '0 auto' }}>
          {/* 5-Second Auto-Advance Bar (Rule 8) */}
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1.25rem',
              background: '#F0F9FF',
              border: '1.5px solid #BAE6FD',
              borderRadius: 'var(--r-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#0284C7',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                }}
              >
                {autoAdvanceTimer}
              </div>
              <div>
                <strong style={{ color: '#0369A1', fontSize: '0.95rem' }}>
                  {currentIndex >= totalQ - 1
                    ? `Showing final winners in ${autoAdvanceTimer}s`
                    : `Next question in ${autoAdvanceTimer}s…`}
                </strong>
                <div
                  style={{
                    width: '140px',
                    height: '4px',
                    background: '#E0F2FE',
                    borderRadius: '2px',
                    marginTop: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(autoAdvanceTimer / 5) * 100}%`,
                      height: '100%',
                      background: '#0284C7',
                      transition: 'width 1s linear',
                    }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setIsAutoPaused((p) => !p)}
                style={{ fontSize: '0.85rem' }}
              >
                {isAutoPaused ? '▶ Resume Timer' : '⏸ Pause'}
              </button>
              <button
                className="btn btn-primary btn--sm"
                onClick={nextQuestion}
                id="next-after-lb-btn"
              >
                {currentIndex >= totalQ - 1 ? '🏁 Finish Quiz Now' : '⏭ Skip to Next Question'}
              </button>
            </div>
          </div>

          {/* Correct answer reveal */}
          {lbCorrectAnswer && currentQuestion?.type === 'mcq' && (
            <div className="alert alert-success" style={{ justifyContent: 'center', fontSize: '1.05rem', padding: '0.9rem' }}>
              ✓ Correct answer: <strong>{lbCorrectAnswer}</strong>
            </div>
          )}
          {/* 3-Step Podium & Leaderboard */}
          <div className="card card--lg">
            <Leaderboard entries={leaderboard} isPodium={true} showAll={true} title="🏆 Classroom Standings" />
          </div>
        </div>
      </div>

      {reactions.map((r) => (
        <span
          key={r.id}
          className="floating-reaction"
          style={{ '--drift': `${r.drift}px` } as React.CSSProperties}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );

  if (step === 'ended') return (
    <div className="page">
      <nav className="nav">
        <span className="nav-logo">
          <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9H11V27H6V9Z" fill="#191C21" />
            <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
            <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
          </svg>
          <span style={{ fontWeight: 800, color: '#191C21' }}>PollMeter</span>
        </span>
        <span className="badge badge-neutral t-label-sm">Session Ended</span>
      </nav>
      <div className="main-content">
        <div className="container--wide" style={{ margin: '0 auto' }}>
          <div className="stack stack-8">
            <div className="text-center stack stack-3">
              <div style={{ fontSize: '4rem', animation: 'bounce-in 0.5s var(--ease)' }}>👑</div>
              <h1 className="t-display" style={{ fontSize: '2.5rem' }}>Classroom Champions!</h1>
              <p className="t-body-lg text-secondary">
                Quiz complete! {finalData?.questions.length} questions answered by {participants.length} students.
              </p>
            </div>

            {/* Final Champion Podium */}
            <div className="card card--lg">
              <Leaderboard entries={leaderboard} isPodium={true} showAll={true} title="🏆 Final Champion Podium" />
            </div>

            {/* Final results per question */}
            {finalData?.questions.map((q, idx) => {
              const agg = finalData.finalResults[q.id];
              return (
                <div key={q.id} className="card card--lg stack stack-4">
                  <div className="row row-2">
                    <span className="badge badge-neutral t-label-sm">Q{idx + 1}</span>
                    <p className="t-title flex-1" style={{ fontSize: '1rem' }}>{q.text}</p>
                  </div>
                  <hr className="divider" />
                  {q.type === 'mcq' ? (
                    <LiveBarChart aggregated={agg as McqAggregated} correctAnswer={q.correctAnswer} />
                  ) : (
                    <TextResponseList responses={agg as TextAggregated} />
                  )}
                </div>
              );
            })}

            <div className="row row-3" style={{ justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
              <button
                className="btn btn-secondary btn--lg"
                onClick={exportResultsCsv}
                id="export-csv-btn"
              >
                📥 Export Results (CSV)
              </button>
              <button
                className="btn btn-primary btn--lg"
                onClick={() => { setStep('build'); setQuestions([]); setCode(''); setHostId(''); setFinalData(null); setLeaderboard([]); }}
                id="new-session-btn"
              >
                + Start a New Session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return null;
}
