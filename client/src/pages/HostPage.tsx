import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import {
  Question,
  SessionPhase,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  HostStatePayload,
  QuestionChangedPayload,
  PhaseChangedPayload,
  ResponseCountPayload,
  ResultsRevealedPayload,
  SessionEndedPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  TimerUpdatedPayload,
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
import { apiUrl } from '../api';

/**
 * The projector laptop is the least reliable machine in the room — someone
 * closes the lid, a screensaver kicks in, a colleague hits Ctrl+R. Keeping the
 * host credentials here means a refresh rejoins the running session instead of
 * orphaning 50 students.
 */
const HOST_LS_KEY = 'pollsync_host';

interface StoredHost {
  code: string;
  hostId: string;
}

export default function HostPage() {
  const [inSession, setInSession] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiInitialTopic, setAiInitialTopic] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [editing, setEditing] = useState<Question | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);

  // Live session state — all server-authoritative.
  const [phase, setPhase] = useState<SessionPhase>('lobby');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [results, setResults] = useState<AggregatedResult | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState<string | undefined>();
  const [timer, setTimer] = useState<{ endsAt: number; durationSeconds: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);

  const [lanIp, setLanIp] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; drift: number }>>([]);

  // Auto-advance off the leaderboard so the room keeps moving on its own.
  const [autoAdvance, setAutoAdvance] = useState(5);
  const [autoPaused, setAutoPaused] = useState(false);

  // Auto-advance from results (2s) to leaderboard so room flows automatically.
  const [resultsAdvance, setResultsAdvance] = useState(2);
  const [resultsPaused, setResultsPaused] = useState(false);

  const credentials = useRef<StoredHost | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/network-info'))
      .then((r) => r.json())
      .then((d) => {
        if (d.localIp && d.localIp !== 'localhost') setLanIp(d.localIp);
      })
      .catch(() => {});
  }, []);

  // ─── Socket wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    function applyHostState(p: HostStatePayload) {
      // `host_state` only ever arrives in reply to an authenticated `host_join`,
      // so credentials.current is already set — don't overwrite it here.
      setInSession(true);
      setCode(p.code);
      setPhase(p.phase);
      setQuestions(p.questions);
      setQuestionCount(p.questions.length);
      setCurrentIndex(Math.max(0, p.currentIndex));
      setCurrentQuestion(p.currentIndex >= 0 ? p.questions[p.currentIndex] ?? null : null);
      setParticipants(p.participants);
      setResults(p.results);
      setAnsweredCount(p.responseCount);
      setLeaderboard(p.leaderboard);
      setLoading(false);

      const q = p.currentIndex >= 0 ? p.questions[p.currentIndex] : null;
      if (q && p.timerEndsAt && p.phase === 'question') {
        setTimer({ endsAt: p.timerEndsAt, durationSeconds: q.timeLimitSeconds });
      } else {
        setTimer(null);
      }
      // After a refresh mid-reveal, the key is already public to the room.
      setCorrectAnswer(
        (p.phase === 'results' || p.phase === 'leaderboard') && q?.correctAnswer
          ? q.correctAnswer
          : undefined
      );
      if (p.finalResults) {
        setFinalData({
          finalResults: p.finalResults,
          questions: p.questions,
          leaderboard: p.leaderboard,
        });
      }
    }

    function onConnect() {
      // Re-attach to the host room; socket.io gives us a new socket id.
      const stored = credentials.current;
      if (stored?.code && stored.hostId) {
        socket.emit('host_join', { code: stored.code, hostId: stored.hostId });
      }
    }

    function onHostState(p: HostStatePayload) {
      applyHostState(p);
    }

    function onHostQuestionChanged(p: QuestionChangedPayload) {
      setPhase('question');
      setCurrentQuestion(p.question);
      setCurrentIndex(p.index);
      if (p.questionCount) setQuestionCount(p.questionCount);
      setResults(null);
      setAnsweredCount(0);
      setCorrectAnswer(undefined);
      setTimer({
        endsAt: p.timerStartedAt + p.question.timeLimitSeconds * 1000,
        durationSeconds: p.question.timeLimitSeconds,
      });
    }

    function onPhaseChanged(p: PhaseChangedPayload) {
      setPhase(p.phase);
      setCurrentIndex(p.currentIndex);
      setQuestionCount(p.questionCount);
    }

    function onTimerUpdated(p: TimerUpdatedPayload) {
      if (!p.timerEndsAt) return;
      setTimer((prev) => (prev ? { ...prev, endsAt: p.timerEndsAt! } : prev));
    }

    function onResponseCount(p: ResponseCountPayload) {
      setAnsweredCount(p.responseCount);
      if (p.results) setResults(p.results);
    }

    function onResultsRevealed(p: ResultsRevealedPayload) {
      setPhase('results');
      setResults(p.aggregated);
      setAnsweredCount(p.responseCount);
      setCorrectAnswer(p.correctAnswer);
      setTimer(null);
    }

    function onLeaderboardUpdated(p: LeaderboardPayload) {
      setPhase('leaderboard');
      setLeaderboard(p.leaderboard);
      setCurrentIndex(p.questionIndex);
      setQuestionCount(p.questionCount);
      if (p.correctAnswer) setCorrectAnswer(p.correctAnswer);
    }

    function onSessionEnded(p: SessionEndedPayload) {
      setPhase('ended');
      setFinalData(p);
      setLeaderboard(p.leaderboard);
      setQuestions(p.questions);
      setTimer(null);
    }

    function onParticipants(p: ParticipantsUpdatedPayload) {
      setParticipants(p.participants);
    }

    function onReaction(p: { emoji: string; id: string }) {
      const drift = (Math.random() - 0.5) * 80;
      setReactions((prev) => [...prev.slice(-12), { id: p.id, emoji: p.emoji, drift }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== p.id)), 2500);
    }

    function onError(p: { message: string }) {
      setError(p.message);
      setLoading(false);
      // The session we remembered is gone (server restart, or swept). Drop the
      // stale credentials so the mentor lands back on the builder, not a
      // dead screen that silently ignores every click.
      if (/not found|not the host/i.test(p.message)) {
        localStorage.removeItem(HOST_LS_KEY);
        credentials.current = null;
        setInSession(false);
      }
    }

    socket.on('connect', onConnect);
    socket.on('host_state', onHostState);
    socket.on('host_question_changed', onHostQuestionChanged);
    socket.on('phase_changed', onPhaseChanged);
    socket.on('timer_updated', onTimerUpdated);
    socket.on('response_count', onResponseCount);
    socket.on('results_revealed', onResultsRevealed);
    socket.on('leaderboard_updated', onLeaderboardUpdated);
    socket.on('session_ended', onSessionEnded);
    socket.on('participants_updated', onParticipants);
    socket.on('reaction_received', onReaction);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('host_state', onHostState);
      socket.off('host_question_changed', onHostQuestionChanged);
      socket.off('phase_changed', onPhaseChanged);
      socket.off('timer_updated', onTimerUpdated);
      socket.off('response_count', onResponseCount);
      socket.off('results_revealed', onResultsRevealed);
      socket.off('leaderboard_updated', onLeaderboardUpdated);
      socket.off('session_ended', onSessionEnded);
      socket.off('participants_updated', onParticipants);
      socket.off('reaction_received', onReaction);
      socket.off('error', onError);
    };
  }, []);

  // Rejoin a session left running before a refresh.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOST_LS_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredHost>;
      if (!stored.code || !stored.hostId) return;
      credentials.current = { code: stored.code, hostId: stored.hostId };
      setCode(stored.code);
      if (!socket.connected) socket.connect();
      socket.emit('host_join', { code: stored.code, hostId: stored.hostId });
    } catch {
      localStorage.removeItem(HOST_LS_KEY);
    }
  }, []);

  // ─── Builder ──────────────────────────────────────────────────────────────
  function addQuestions(qs: Question[]) {
    setQuestions((prev) => [...prev, ...qs]);
  }

  function saveQuestion(q: Question) {
    setQuestions((prev) => {
      const idx = prev.findIndex((p) => p.id === q.id);
      if (idx === -1) return [...prev, q];
      const next = [...prev];
      next[idx] = q;
      return next;
    });
    setEditing(null);
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setEditing((prev) => (prev?.id === id ? null : prev));
  }

  function moveQuestion(id: string, delta: number) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      const target = idx + delta;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function createSession() {
    setError('');
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Could not create the session.');

      credentials.current = { code: d.code, hostId: d.hostId };
      localStorage.setItem(HOST_LS_KEY, JSON.stringify(credentials.current));
      setCode(d.code);
      setQuestionCount(questions.length);      setPhase('lobby');
      setInSession(true);
      socket.emit('host_join', { code: d.code, hostId: d.hostId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create the session.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Presenter commands ───────────────────────────────────────────────────
  const send = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      const c = credentials.current;
      if (!c) return;
      setError('');
      socket.emit(event, { code: c.code, hostId: c.hostId, ...extra });
    },
    []
  );

  const start = useCallback(() => send('host_start'), [send]);
  const lockAnswers = useCallback(() => send('host_lock'), [send]);
  const showLeaderboard = useCallback(() => send('host_show_leaderboard'), [send]);
  const next = useCallback(() => send('host_next'), [send]);
  const previous = useCallback(() => send('host_previous'), [send]);
  const extendTime = useCallback((seconds: number) => send('host_extend_time', { seconds }), [send]);
  const endSession = useCallback(() => send('host_end'), [send]);

  // ─── Auto-advance from results to leaderboard (2s) ────────────────────────
  useEffect(() => {
    if (phase !== 'results') return;
    setResultsAdvance(2);
    setResultsPaused(false);
  }, [phase, currentIndex]);

  useEffect(() => {
    if (phase !== 'results' || resultsPaused) return;
    const id = setInterval(() => {
      setResultsAdvance((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          showLeaderboard();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, resultsPaused, showLeaderboard]);

  // ─── Auto-advance from the leaderboard (5s) ───────────────────────────────
  useEffect(() => {
    if (phase !== 'leaderboard') return;
    setAutoAdvance(5);
    setAutoPaused(false);
  }, [phase, currentIndex]);

  useEffect(() => {
    if (phase !== 'leaderboard' || autoPaused) return;
    const id = setInterval(() => {
      setAutoAdvance((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          next();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, autoPaused, next]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function exportResultsCsv() {
    if (leaderboard.length === 0) return;
    const headers = ['Rank', 'Student Name', 'Total Score', 'Correct Answers', 'Questions Answered'];
    const rows = leaderboard.map((e) => [
      e.rank,
      `"${e.name.replace(/"/g, '""')}"`,
      e.totalScore,
      e.correctAnswers,
      e.questionsAnswered,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PollMeter_Results_${code || 'session'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function newSession() {
    localStorage.removeItem(HOST_LS_KEY);
    credentials.current = null;
    setInSession(false);
    setPhase('lobby');
    setQuestions([]);
    setCode('');
    setFinalData(null);
    setLeaderboard([]);
    setParticipants([]);
    setCurrentQuestion(null);
    setResults(null);
    setError('');
  }

  const port = window.location.port ? `:${window.location.port}` : '';
  const joinHost =
    lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
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

  function scrollToBuilder() {
    builderRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function openWithTopic(topicPrompt: string) {
    setAiInitialTopic(topicPrompt);
    setShowAI(true);
  }

  const connectedCount = participants.filter((p) => p.connected).length;
  const isLastQuestion = currentIndex >= questionCount - 1;
  const everyoneAnswered = connectedCount > 0 && answeredCount >= connectedCount;

  const sessionNav = (
    <nav className="menti-stage-nav">
      {/* Brand */}
      <span className="menti-stage-nav-brand">
        <svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 9H11V27H6V9Z" fill="#fff" />
          <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
          <rect x="22" y="7" width="5" height="20" rx="1" fill="#38BDF8" />
        </svg>
        <span>PollMeter</span>
      </span>

      {/* Centre join hint */}
      <div className="menti-stage-nav-join">
        <span>Go to </span>
        <strong>{joinHost}/join</strong>
        <span> and use code </span>
        <strong className="menti-stage-nav-code">{code}</strong>
      </div>

      {/* Right controls */}
      <div className="menti-stage-nav-right">
        {phase !== 'ended' && (
          <span className="menti-stage-live-dot" aria-label="Live session">
            <span className="menti-stage-live-pulse" />
            Live
          </span>
        )}
        <span className="menti-stage-chip">👥 {connectedCount}</span>
        {questionCount > 0 && phase !== 'lobby' && (
          <span className="menti-stage-chip">Q {currentIndex + 1}/{questionCount}</span>
        )}
        {phase === 'question' && (
          <span className={`menti-stage-chip menti-stage-chip--tally${everyoneAnswered ? ' menti-stage-chip--complete' : ''}`}>
            {everyoneAnswered ? '✔ All answered' : `${answeredCount}/${connectedCount || '—'} answered`}
          </span>
        )}
        <button
          className="menti-stage-btn-ghost"
          onClick={toggleFullscreen}
          id="fullscreen-btn"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter projector mode'}
        >
          {isFullscreen ? '✕ Exit' : '⛶ Projector'}
        </button>
      </div>
    </nav>
  );


  // ─── Builder screen ───────────────────────────────────────────────────────
  if (!inSession) return (
    <div className="menti-app-shell">
      <aside className="menti-sidebar">
        <div>
          <a href="/dashboard" className="menti-sidebar-brand">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9H11V27H6V9Z" fill="#191C21" />
              <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
              <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', color: '#191C21' }}>
              PollMeter
            </span>
          </a>

          <button className="menti-btn-new" onClick={scrollToBuilder} id="new-menti-btn">
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> New quiz
          </button>

          <nav className="menti-nav-group">
            <button
              className={`menti-nav-link ${activeNav === 'home' ? 'active' : ''}`}
              onClick={() => setActiveNav('home')}
            >
              <span>🏠</span> Home
            </button>
            <button
              className={`menti-nav-link ${activeNav === 'build' ? 'active' : ''}`}
              onClick={() => { setActiveNav('build'); scrollToBuilder(); }}
            >
              <span>📝</span> Question builder
            </button>
            <button className="menti-nav-link" onClick={() => openWithTopic('')}>
              <span>✨</span> Generate with AI
            </button>
          </nav>

          <div className="menti-nav-group">
            <div className="menti-nav-title">THIS QUIZ</div>
            <button className="menti-nav-link" onClick={scrollToBuilder}>
              <span>📋</span> {questions.length} question{questions.length === 1 ? '' : 's'}
            </button>
            {questions.length > 0 && (
              <button className="menti-nav-link" onClick={() => setQuestions([])}>
                <span>🗑️</span> Clear all
              </button>
            )}
          </div>
        </div>

        <div className="menti-sidebar-footer">
          <button className="menti-nav-link" onClick={scrollToBuilder}><span>📖</span> How it works</button>
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
        <header className="menti-topbar">
          <div className="menti-search">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search your questions"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="menti-topbar-actions">
            <div className="menti-avatar" title="Mentor">M</div>
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

        <main className="menti-content">
          <h1 className="menti-welcome-title">Run a quiz with your class</h1>

          <section className="menti-hero-row">
            <div className="menti-card-live">
              <div>
                <div className="menti-live-pill">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" rx="6" fill="#3B82F6" />
                    <circle cx="12" cy="12" r="5" fill="#FFFFFF" />
                  </svg>
                  <span>Live</span>
                </div>

                <h2 className="menti-live-headline">GENERATE.<br />PROJECT.<br />PLAY.</h2>

                <p className="menti-live-desc">
                  Type a topic or paste your syllabus, generate the questions, then put the code on
                  the screen. Students join by QR on their phones or by code on a laptop.
                </p>
              </div>

              <div>
                <button className="menti-btn-presentation" onClick={() => openWithTopic('')} id="make-presentation-btn">
                  ✨ Generate questions →
                </button>
              </div>

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

            <div className="menti-card-mini">
              <div className="menti-mini-badge">
                <span style={{ color: '#6366F1', fontSize: '1.2rem' }}>◆</span>
                <span>Scored quiz</span>
              </div>
              <p className="menti-mini-desc">
                Mark the right option — correct answers score 1000 plus a speed bonus.
              </p>
              <button className="menti-mini-arrow" onClick={scrollToBuilder} aria-label="Build a scored quiz">→</button>
            </div>

            <div className="menti-card-mini">
              <div className="menti-mini-badge">
                <span style={{ color: '#EC4899', fontSize: '1.2rem' }}>●</span>
                <span>Poll</span>
              </div>
              <p className="menti-mini-desc">
                Leave the answer unmarked and the bars fill live. No scoring.
              </p>
              <button className="menti-mini-arrow" onClick={scrollToBuilder} aria-label="Build a poll">→</button>
            </div>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <div className="menti-ai-header">
              <span>Generate from your syllabus</span>
              <span style={{ color: '#8B5CF6' }}>✨</span>
            </div>

            <div className="menti-ai-grid">
              {[
                { icon: '📘', label: 'Today’s chapter', topic: '' },
                { icon: '🧠', label: 'Recap last class', topic: 'Quick recap of the previous lesson' },
                { icon: '📐', label: 'Practice problems', topic: 'Practice problems with worked answers' },
                { icon: '🔍', label: 'Check understanding', topic: 'Concept check on the core ideas of the topic' },
                { icon: '🎯', label: 'Exam revision', topic: 'Exam-style revision questions' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="menti-ai-box"
                  onClick={() => openWithTopic(item.topic)}
                  onKeyDown={(e) => e.key === 'Enter' && openWithTopic(item.topic)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="menti-ai-icon">{item.icon}</span>
                  <span className="menti-ai-label">{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section ref={builderRef} style={{ scrollMarginTop: '80px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.25rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h3 className="t-title" style={{ fontSize: '1.35rem' }}>Question builder</h3>
                <p className="t-body-sm text-secondary">
                  Scored multiple choice, unscored polls, or open text.
                </p>
              </div>
              <button className="btn btn-ai btn--sm" onClick={() => openWithTopic('')} id="open-ai-builder-btn">
                ✨ AI Generate
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: questions.length > 0 ? '1.8fr 1.2fr' : '1fr',
                gap: '1.5rem',
                alignItems: 'start',
              }}
            >
              <div className="card card--lg" style={{ borderRadius: '20px' }}>
                <p className="t-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{editing ? '✏️' : '➕'}</span> {editing ? 'Edit question' : 'Add a question'}
                </p>
                <QuestionForm
                  initial={editing}
                  onSave={saveQuestion}
                  onCancel={editing ? () => setEditing(null) : undefined}
                />
              </div>

              {questions.length > 0 && (
                <div className="card stack stack-4" style={{ borderRadius: '20px' }}>
                  <div className="row row-3" style={{ justifyContent: 'space-between' }}>
                    <p className="t-title">Your questions</p>
                    <span className="badge badge-primary">{questions.length}</span>
                  </div>

                  <div className="stack stack-3" style={{ maxHeight: 420, overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {questions.map((q, idx) => (
                      <div
                        key={q.id}
                        className="card card--sm row row-3"
                        style={{ alignItems: 'flex-start', background: '#FFFFFF' }}
                      >
                        <div className="flex-1 stack stack-2">
                          <div className="row row-2 row-wrap">
                            <span className="badge badge-neutral t-label-sm">#{idx + 1}</span>
                            <span className={`badge t-label-sm ${q.type === 'mcq' ? 'badge-primary' : 'badge-success'}`}>
                              {q.type === 'mcq' ? 'MCQ' : 'Open text'}
                            </span>
                            <span className="badge badge-warning t-label-sm">⏱ {q.timeLimitSeconds}s</span>
                            {q.correctAnswer ? (
                              <span className="badge badge-success t-label-sm">✓ Scored</span>
                            ) : (
                              <span className="badge badge-neutral t-label-sm">Poll</span>
                            )}
                          </div>
                          <p className="t-body-md text-primary" style={{ fontWeight: 600 }}>{q.text}</p>
                          {q.options && <p className="t-body-sm text-muted">{q.options.join(' · ')}</p>}
                        </div>

                        <div className="stack stack-2">
                          <div className="row row-2">
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => moveQuestion(q.id, -1)}
                              disabled={idx === 0}
                              aria-label={`Move question ${idx + 1} up`}
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => moveQuestion(q.id, 1)}
                              disabled={idx === questions.length - 1}
                              aria-label={`Move question ${idx + 1} down`}
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="row row-2">
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => { setEditing(q); scrollToBuilder(); }}
                              aria-label={`Edit question ${idx + 1}`}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="btn btn-ghost btn--icon btn--sm"
                              onClick={() => removeQuestion(q.id)}
                              aria-label={`Remove question ${idx + 1}`}
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
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
                      <><span className="spinner spinner--sm" style={{ borderTopColor: '#fff' }} /> Creating…</>
                    ) : (
                      `🚀 Get the join code (${questions.length} question${questions.length === 1 ? '' : 's'})`
                    )}
                  </button>
                </div>
              )}
            </div>

            {questions.length === 0 && (
              <div
                className="card text-center stack stack-3"
                style={{ padding: '2.5rem', background: '#FFFFFF', borderRadius: '20px', marginTop: '1.5rem' }}
              >
                <p className="t-body-md text-secondary">
                  💡 No questions yet. Write one above, or hit <strong>✨ AI Generate</strong> and paste
                  your topic or syllabus to get a full set in one go.
                </p>
                {error && <div className="alert alert-error">⚠ {error}</div>}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );

  // ─── Lobby ────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div className="page">
      {sessionNav}
      <div className="main-content">
        <div className="container--narrow" style={{ margin: '0 auto' }}>
          <div className="stack stack-6">
            <div className="text-center stack stack-2">
              <h1 className="t-headline">Ready when you are</h1>
              <p className="t-body-md text-secondary">
                Students scan the code with a phone camera, or go to{' '}
                <strong>{joinHost}/join</strong> on a laptop and type the code.
              </p>
            </div>

            <QRCodeDisplay url={joinUrl} code={code} />

            <div className="row row-2" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary btn--sm" onClick={copyJoinLink} id="copy-link-btn">
                {copied ? '✓ Copied' : '📋 Copy join link'}
              </button>
            </div>

            <div className="card stack stack-3 text-center" style={{ background: 'var(--surface-low)' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="t-label-md">👥 In the room</span>
                <span className="badge badge-primary">{participants.length}</span>
              </div>
              {participants.length === 0 ? (
                <p className="t-body-sm text-muted">Waiting for the first student to join with code {code}…</p>
              ) : (
                <div className="row row-2 row-wrap" style={{ justifyContent: 'center' }}>
                  {participants.map((p) => (
                    <span
                      key={p.id}
                      className="badge badge-neutral"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', opacity: p.connected ? 1 : 0.5 }}
                    >
                      👤 {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">⚠ {error}</div>}

            <div className="host-bar">
              <button className="btn btn-ghost" onClick={newSession}>← Back to builder</button>
              <div className="host-bar-spacer" />
              <button className="btn btn-success btn--lg" onClick={start} id="start-session-btn">
                ▶ Start · {questionCount} question{questionCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Ended ────────────────────────────────────────────────────────────────
  if (phase === 'ended') return (
    <div className="page">
      {sessionNav}
      <div className="main-content">
        <div className="container--wide" style={{ margin: '0 auto' }}>
          <div className="stack stack-8">
            <div className="text-center stack stack-3">
              <div style={{ fontSize: '4rem', animation: 'bounce-in 0.5s var(--ease)' }}>👑</div>
              <h1 className="t-display" style={{ fontSize: '2.5rem' }}>Final standings</h1>
              <p className="t-body-lg text-secondary">
                {finalData?.questions.length ?? questionCount} question
                {(finalData?.questions.length ?? questionCount) === 1 ? '' : 's'} ·{' '}
                {leaderboard.length} student{leaderboard.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="card card--lg">
              <Leaderboard
                entries={leaderboard}
                variant="projector"
                showAll
                title="🏆 Champions"
                celebrateKey="final"
              />
            </div>

            {finalData?.questions.map((q, idx) => {
              const agg = finalData.finalResults[q.id];
              if (!agg) return null;
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

            <div className="host-bar">
              <button className="btn btn-secondary btn--lg" onClick={exportResultsCsv} id="export-csv-btn">
                📥 Export CSV
              </button>
              <div className="host-bar-spacer" />
              <button className="btn btn-primary btn--lg" onClick={newSession} id="new-session-btn">
                + New quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Live stage: question / results / leaderboard ─────────────────────────
  const gradedAndOpen = phase === 'question' && Boolean(currentQuestion?.correctAnswer);

  return (
    <div className="page page--stage">
      {sessionNav}

      <main className="stage-main">
        {/* Slim progress strip */}
        <div className="stage-progress-strip">
          <div className="stage-progress-labels">
            <span className="stage-progress-q">
              Question {currentIndex + 1} of {questionCount}
            </span>
            <span className="stage-progress-rem">
              {Math.max(0, questionCount - currentIndex - 1)} to go
            </span>
          </div>
          <div className="stage-progress-bar">
            <div
              className="stage-progress-fill"
              style={{ width: `${questionCount ? ((currentIndex + 1) / questionCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {phase === 'leaderboard' ? (
          <div className="stage-lb-wrap">
            {/* Correct answer reveal banner */}
            {correctAnswer && (
              <div className="menti-correct-banner">
                <span className="menti-correct-icon" aria-hidden="true">✔</span>
                <span>Correct answer: <strong>{correctAnswer}</strong></span>
              </div>
            )}
            {/* Racing leaderboard */}
            <div className="card card--lg stage-lb-card">
              <Leaderboard
                entries={leaderboard}
                variant="projector"
                showAll
                title="🏆 Standings"
                celebrateKey={currentIndex}
              />
            </div>
          </div>
        ) : (
          currentQuestion && (
            <div className="menti-stage-card">
              {/* ─── Question header ─── */}
              <div className="menti-stage-q-header">
                <div className="menti-stage-q-body">
                  <span className="menti-stage-q-num">
                    Question {currentIndex + 1} of {questionCount}
                  </span>
                  <h1 className="menti-stage-question">{currentQuestion.text}</h1>
                </div>
                {/* Countdown timer */}
                {phase === 'question' && timer && (
                  <div className="menti-stage-timer-wrap">
                    <CountdownTimer
                      endsAt={timer.endsAt}
                      durationSeconds={timer.durationSeconds}
                      size={82}
                    />
                  </div>
                )}
                {/* Results phase — no timer, show answered count */}
                {phase === 'results' && (
                  <div className="menti-stage-reveal-badge">
                    <span aria-hidden="true">👁</span> Results revealed
                  </div>
                )}
              </div>

              <div className="menti-stage-divider" />

              {/* ─── Content area ─── */}
              {currentQuestion.type === 'mcq' ? (
                gradedAndOpen && results == null ? (
                  /* Scored question: show colorful option cards while hidden */
                  <div className="menti-stage-options">
                    {(currentQuestion.options ?? []).map((opt, idx) => {
                      const COLORS = ['#38BDF8','#F43F5E','#34D399','#FBBF24','#A78BFA','#FB923C'];
                      const color = COLORS[idx % COLORS.length];
                      const LETTERS = ['A','B','C','D','E','F'];
                      return (
                        <div
                          key={opt}
                          className="menti-stage-opt-card"
                          style={{
                            background: `${color}18`,
                            borderColor: `${color}60`,
                            '--opt-color': color,
                          } as React.CSSProperties}
                        >
                          <span
                            className="menti-stage-opt-letter"
                            style={{ background: color }}
                          >
                            {LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="menti-stage-opt-text">{opt}</span>
                        </div>
                      );
                    })}
                    {/* Hidden tally */}
                    <div className="menti-stage-hidden-tally">
                      <span className="menti-stage-hidden-icon" aria-hidden="true">🔒</span>
                      <span>{answeredCount} student{answeredCount === 1 ? '' : 's'} answered — results hidden until closed</span>
                    </div>
                  </div>
                ) : (
                  /* Poll open OR results revealed — show column chart */
                  <LiveBarChart
                    aggregated={(results ?? {}) as McqAggregated}
                    correctAnswer={phase === 'results' ? correctAnswer : undefined}
                    variant="projector"
                  />
                )
              ) : (
                <TextResponseList
                  responses={Array.isArray(results) ? (results as TextAggregated) : []}
                  variant="projector"
                />
              )}
            </div>
          )
        )}

        {error && <div className="alert alert-error" style={{ margin: 0, padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>⚠ {error}</div>}

        {/* ─── Presenter controls ─────────────────────────────────────── */}
        <div className="host-bar">
          <button
            className="btn btn-ghost"
            onClick={previous}
            disabled={currentIndex <= 0}
            title="Re-run the previous question"
          >
            ← Previous
          </button>

          {phase === 'question' && (
            <>
              <button className="btn btn-quiet" onClick={() => extendTime(15)} id="extend-time-btn">
                +15s
              </button>
              <span className="t-label-sm text-muted">
                {everyoneAnswered ? 'Everyone has answered' : 'Waiting for answers…'}
              </span>
            </>
          )}

          {phase === 'results' && (
            <div className="row row-2">
              <span className="chip chip--pulse">
                Leaderboard in {resultsAdvance}s
              </span>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setResultsPaused((p) => !p)}
                title={resultsPaused ? 'Resume countdown' : 'Pause countdown'}
              >
                {resultsPaused ? '▶ Resume' : '⏸ Pause'}
              </button>
            </div>
          )}

          {phase === 'leaderboard' && (
            <div className="row row-2">
              <span className="chip chip--pulse">
                {isLastQuestion ? 'Finishing' : 'Next question'} in {autoAdvance}s
              </span>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setAutoPaused((p) => !p)}
                title={autoPaused ? 'Resume countdown' : 'Pause countdown'}
              >
                {autoPaused ? '▶ Resume' : '⏸ Pause'}
              </button>
            </div>
          )}

          <div className="host-bar-spacer" />

          <button className="btn btn-ghost" onClick={endSession} id="end-session-btn">
            Finish early
          </button>

          {phase === 'question' && (
            <button className="btn btn-primary btn--lg" onClick={lockAnswers} id="lock-answers-btn">
              🔒 Close &amp; show results
            </button>
          )}

          {phase === 'results' && (
            <>
              <button className="btn btn-secondary btn--lg" onClick={showLeaderboard} id="show-leaderboard-btn">
                🏆 Show now
              </button>
              <button
                className={`btn btn--lg ${isLastQuestion ? 'btn-danger' : 'btn-primary'}`}
                onClick={next}
                id="next-question-btn"
              >
                {isLastQuestion ? '🏁 Finish' : 'Next question →'}
              </button>
            </>
          )}

          {phase === 'leaderboard' && (
            <button
              className={`btn btn--lg ${isLastQuestion ? 'btn-danger' : 'btn-primary'}`}
              onClick={next}
              id="next-after-lb-btn"
            >
              {isLastQuestion ? '🏁 Finish' : 'Next question →'}
            </button>
          )}
        </div>
      </main>

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
}
