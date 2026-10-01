import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../../socket';
import {
  Question,
  SessionPhase,
  Participant,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  LeaderboardEntry,
  SessionEndedPayload,
  HostStatePayload,
  QuestionChangedPayload,
  PhaseChangedPayload,
  ResponseCountPayload,
  ResultsRevealedPayload,
  LeaderboardPayload,
  TimerUpdatedPayload,
  ParticipantsUpdatedPayload,
  SocketErrorPayload,
} from '../../types';
import LiveBarChart from '../../components/LiveBarChart';
import TextResponseList from '../../components/TextResponseList';
import CountdownTimer from '../../components/CountdownTimer';
import Leaderboard, { OlympicPodium, fire4CornerFireworks } from '../../components/Leaderboard';
import { apiUrl } from '../../api';
import { cleanText } from '../../cleanText';
import { getAvatar } from '../../utils/avatars';
import { playCue, unlockAudio, isMuted, toggleMuted } from '../../sounds';
import { getActiveTheme, toggleTheme, Theme } from '../../theme';
import { QRCodeSVG } from 'qrcode.react';
import { getStoredHost, clearStoredHost, StoredHost } from './hostSession';

export default function LiveSessionRoom() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [code, setCode] = useState(urlCode || '');
  const credentials = useRef<StoredHost | null>(null);

  // Guard against missing or mismatched localStorage host credentials
  useEffect(() => {
    const stored = getStoredHost();
    if (!stored || !urlCode || stored.code.toUpperCase() !== urlCode.toUpperCase()) {
      navigate('/dashboard', { replace: true });
      return;
    }
    credentials.current = stored;
    setCode(stored.code);
    if (!socket.connected) socket.connect();
    socket.emit('host_join', { code: stored.code, hostId: stored.hostId });
  }, [urlCode, navigate]);



  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hostTheme, setHostTheme] = useState<Theme>(getActiveTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', hostTheme);
  }, [hostTheme]);

  // Live session state — all server-authoritative.
  const [phase, setPhase] = useState<SessionPhase>('lobby');
  const [participants, setParticipants] = useState<Participant[]>([]);
  /**
   * A student who joined mid-quiz used to be invisible to the mentor: the roster
   * rendered only on the lobby screen, and someone on 0 points sits well below
   * the top-10 leaderboard cut. The server was broadcasting them correctly all
   * along — nothing on the presenter screen drew them. These back an always-on
   * head count plus a short-lived toast per genuinely new arrival.
   */
  const [showRoster, setShowRoster] = useState(false);
  const [joinAlerts, setJoinAlerts] = useState<{ id: string; name: string }[]>([]);
  const knownParticipantIds = useRef<Set<string>>(new Set());
  const phaseRef = useRef<SessionPhase>('lobby');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [results, setResults] = useState<AggregatedResult | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState<string | undefined>();
  const [timer, setTimer] = useState<{
    endsAt: number;
    durationSeconds: number;
    startedAt?: number;
    unlocksAt?: number | null;
    readTimeSeconds?: number | null;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prevLeaderboard, setPrevLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);

  // Dynamic Reading Buffer
  const [readSecondsLeft, setReadSecondsLeft] = useState(0);

  useEffect(() => {
    if (!timer?.unlocksAt) {
      setReadSecondsLeft(0);
      return;
    }
    const update = () => {
      const left = Math.max(0, Math.ceil((timer.unlocksAt! - Date.now()) / 1000));
      setReadSecondsLeft(left);
    };
    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [timer?.unlocksAt]);

  const isReadingTime = Boolean(phase === 'question' && timer?.unlocksAt && readSecondsLeft > 0);

  const [lanIp, setLanIp] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; left: number; drift: number; duration: number }>>([]);

  // Auto-advance toggle: defaults to false (manual mode) so mentor has complete control
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(() => {
    return localStorage.getItem('pollmeter_auto_advance') === 'true';
  });
  const [autoAdvance, setAutoAdvance] = useState(5);
  const [autoPaused, setAutoPaused] = useState(false);

  // Auto-advance from results (2s) to leaderboard so room flows automatically.
  const [resultsAdvance, setResultsAdvance] = useState(2);
  const [resultsPaused, setResultsPaused] = useState(false);

  // True when the host stepped back to review an already-answered question.
  // Suppresses the 2-second auto-advance so the mentor can explain at leisure.
  const [isReviewMode, setIsReviewMode] = useState(false);

  // Projector sound. Host screen only — a hundred phones chiming out of sync
  // would be noise, not atmosphere.
  const [muted, setMuted] = useState(isMuted());

  

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
        setTimer({
          endsAt: p.timerEndsAt,
          startedAt: p.timerStartedAt ?? undefined,
          unlocksAt: p.unlocksAt,
          readTimeSeconds: p.readTimeSeconds,
          durationSeconds: q.timeLimitSeconds,
        });
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
      setIsReviewMode(false);  // fresh live question — re-enable 2s auto-advance
      setCurrentQuestion(p.question);
      setCurrentIndex(p.index);
      if (p.questionCount) setQuestionCount(p.questionCount);
      setResults(null);
      setAnsweredCount(0);
      const readSecs = p.readTimeSeconds ?? 3;
      const unlocksAt = p.unlocksAt ?? (p.timerStartedAt + readSecs * 1000);
      const endsAt = unlocksAt + p.question.timeLimitSeconds * 1000;
      setTimer({
        endsAt,
        startedAt: p.timerStartedAt,
        unlocksAt,
        readTimeSeconds: readSecs,
        durationSeconds: p.question.timeLimitSeconds,
      });
    }

    function onQuestionReviewed(p: { index: number; questionCount: number }) {
      // The server stepped back: surface results read-only, suppress auto-advance.
      setIsReviewMode(true);
      setCurrentIndex(p.index);
      setQuestionCount(p.questionCount);
      setResultsPaused(true); // explicitly halt the countdown for review mode
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
      setLeaderboard((prev) => {
        setPrevLeaderboard(prev);
        return p.leaderboard;
      });
      setCurrentIndex(p.questionIndex);
      setQuestionCount(p.questionCount);
      if (p.correctAnswer) setCorrectAnswer(p.correctAnswer);
    }

    function onSessionEnded(p: SessionEndedPayload) {
      setPhase('ended');
      setFinalData(p);
      setLeaderboard((prev) => {
        setPrevLeaderboard(prev);
        return p.leaderboard;
      });
      setQuestions(p.questions);
      setTimer(null);
    }

    function onParticipants(p: ParticipantsUpdatedPayload) {
      setParticipants(p.participants);

      // Anyone whose id we haven't seen before is a real arrival. A student
      // reconnecting after their phone slept keeps the same id, so wifi churn
      // correctly stays silent instead of toasting the same name all lesson.
      const known = knownParticipantIds.current;
      const arrivals = p.participants.filter((x) => !known.has(x.id));
      for (const x of p.participants) known.add(x.id);

      // The lobby already lists everyone by name, so announcing there is noise.
      if (arrivals.length === 0 || phaseRef.current === 'lobby') return;

      // Cap the burst: a coach class filing in at once shouldn't bury the
      // presenter controls under a column of toasts.
      const alerts = arrivals.slice(0, 3).map((x) => ({
        id: `${x.id}-${Date.now()}`,
        name: x.name,
      }));
      setJoinAlerts((prev) => [...prev, ...alerts]);
      window.setTimeout(() => {
        const expired = new Set(alerts.map((a) => a.id));
        setJoinAlerts((prev) => prev.filter((a) => !expired.has(a.id)));
      }, 4500);
    }

    function onReaction(p: { emoji: string; id: string }) {
      const left = 15 + Math.random() * 70;
      const drift = (Math.random() - 0.5) * 50;
      const duration = 2.2 + Math.random() * 0.5;
      setReactions((prev) => [...prev.slice(-15), { id: p.id, emoji: p.emoji, left, drift, duration }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== p.id)), 2700);
    }

    function onError(p: SocketErrorPayload) {
      setError(p.message);
      setLoading(false);
      // The session we remembered is gone (server restart, or swept). Drop the
      // stale credentials so the mentor lands back on the builder, not a
      // dead screen that silently ignores every click.
      //
      // `fatal` is the server's own signal. The message test stays as a fallback
      // for the window where a cached Cloudflare bundle is talking to a freshly
      // deployed backend, or the reverse — the two halves ship separately.
      if (p.fatal || /not found|not the host/i.test(p.message)) {
        clearStoredHost();
        credentials.current = null;
        navigate('/dashboard', { replace: true });
      }
    }

    socket.on('connect', onConnect);
    socket.on('host_state', onHostState);
    socket.on('host_question_changed', onHostQuestionChanged);
    socket.on('question_reviewed', onQuestionReviewed);
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
      socket.off('question_reviewed', onQuestionReviewed);
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

  // ─── Presenter commands ───────────────────────────────────────────────────
  const send = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      const c = credentials.current;
      if (!c) return;
      // Presenter clicks are the user gesture browsers require before they will
      // let a page make any sound at all.
      unlockAudio();
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

  // `onParticipants` is registered once at mount, so it can't read `phase` from
  // state without going stale. Mirror it into a ref instead.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ─── Auto-advance from results to leaderboard (2s) ────────────────────────
  useEffect(() => {
    if (phase !== 'results') return;
    setResultsAdvance(2);
    // In review mode the mentor stepped back — never auto-flip to leaderboard;
    // they'll click "Next" or manually trigger when they're ready.
    if (isReviewMode) {
      setResultsPaused(true);
    } else {
      setResultsPaused(false);
    }
  }, [phase, currentIndex, isReviewMode]);

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

  // ─── Auto-advance from the leaderboard (manual by default) ────────────────
  useEffect(() => {
    if (phase !== 'leaderboard') return;
    setAutoAdvance(5);
    setAutoPaused(false);
  }, [phase, currentIndex]);

  useEffect(() => {
    if (phase !== 'leaderboard' || !autoAdvanceEnabled || autoPaused) return;
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
  }, [phase, autoAdvanceEnabled, autoPaused, next]);

  // Keyboard navigation for host: Space or ArrowRight to advance on leaderboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'ArrowRight') {
        if (phase === 'leaderboard') {
          e.preventDefault();
          next();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, next]);

  // ─── Projector audio cues ─────────────────────────────────────────────────
  // Driven off the server phase, like everything else on this screen, so the
  // sound can never disagree with what the room is looking at.
  const prevPhase = useRef<SessionPhase | null>(null);
  useEffect(() => {
    
    if (prevPhase.current === phase) return;
    const from = prevPhase.current;
    prevPhase.current = phase;
    // No cue for the first phase we observe: on a mid-quiz refresh the host
    // would otherwise be met with a fanfare for something already on screen.
    if (from === null) return;

    if (phase === 'question') playCue('start');
    else if (phase === 'results') playCue('reveal');
    else if (phase === 'leaderboard') playCue('leaderboard');
    else if (phase === 'ended') {
      playCue('podium');
      fire4CornerFireworks();
    }
  }, [phase]);

  // Final five seconds. Deliberately derived from the timer's own end time
  // rather than a counter, and de-duped, so interval drift can't double-beep.
  const lastTick = useRef(0);
  useEffect(() => {
    if (phase !== 'question' || !timer) return;
    lastTick.current = 0;
    const id = setInterval(() => {
      const left = Math.ceil((timer.endsAt - Date.now()) / 1000);
      if (left >= 1 && left <= 5 && left !== lastTick.current) {
        lastTick.current = left;
        playCue('tick');
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, timer]);

  const toggleSound = useCallback(() => {
    unlockAudio();
    setMuted(toggleMuted());
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function exportResultsCsv() {
    if (leaderboard.length === 0) return;
    const headers = [
      'Rank',
      'Real Name (College ID)',
      'Screen Name (Quiz)',
      'College Email',
      'Total Score',
      'Correct Answers',
      'Questions Answered',
      'Accuracy %',
      'Best Streak',
    ];
    const rows = leaderboard.map((e) => {
      const p = participants.find((part) => part.id === e.participantId);
      const realName = p?.realName || e.realName || e.name;
      const email = p?.email || e.email || '—';
      const accuracy = e.questionsAnswered > 0 ? Math.round((e.correctAnswers / e.questionsAnswered) * 100) : 0;
      return [
        e.rank,
        `"${realName.replace(/"/g, '""')}"`,
        `"${e.name.replace(/"/g, '""')}"`,
        `"${email.replace(/"/g, '""')}"`,
        e.totalScore,
        e.correctAnswers,
        e.questionsAnswered,
        `${accuracy}%`,
        e.bestStreak ?? 0,
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `MSU_Quiz_Results_${code || 'session'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function newSession() {
    clearStoredHost();
    navigate('/dashboard');
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

  useEffect(() => {
    function onFsChange() {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    document.addEventListener('MSFullscreenChange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
      document.removeEventListener('MSFullscreenChange', onFsChange);
    };
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
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
        {phase === 'ended' ? (
          <button
            className="btn btn-primary btn--sm"
            onClick={newSession}
            id="nav-new-quiz-btn"
            style={{ fontWeight: 700, padding: '0.45rem 1rem', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px' }}
          >
            + Start New Quiz
          </button>
        ) : (
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
          onClick={() => setHostTheme(toggleTheme())}
          id="stage-theme-toggle-btn"
          title={hostTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle theme"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <span>{hostTheme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{hostTheme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
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
  // ─── Lobby ────────────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div className="page page--stage page--stage-lobby">
      {sessionNav}
      <main className="stage-main stage-lobby-main">
        <div className="menti-lobby-grid">
          {/* Left Column: Instructions, Big Code, Participants & Start button */}
          <div className="menti-lobby-left">
            <div className="menti-lobby-header">
              <span className="badge badge-primary menti-lobby-badge">✨ Live Classroom Quiz</span>
              <h1 className="menti-lobby-title">Ready when you are!</h1>
              <p className="menti-lobby-subtitle">
                Students can scan the QR code with their phone camera or join on a laptop:
              </p>
            </div>

            {/* Join Details Box */}
            <div className="menti-lobby-code-box">
              <div className="menti-lobby-url-row">
                <span className="menti-lobby-step-num">1</span>
                <span>Go to <strong>{joinHost}/join</strong></span>
              </div>
              <div className="menti-lobby-code-row">
                <span className="menti-lobby-step-num">2</span>
                <span>Enter code:</span>
                <span className="menti-lobby-code-val" aria-label={`Session code ${code}`}>
                  {code.slice(0, 3)} {code.slice(3)}
                </span>
                <button
                  className="btn btn-secondary btn--sm menti-lobby-copy-btn"
                  onClick={copyJoinLink}
                  id="copy-link-btn"
                  title="Copy direct join link"
                >
                  {copied ? '✓ Copied!' : '📋 Copy link'}
                </button>
              </div>
            </div>

            {/* Connected Participants Tally & Avatars */}
            <div className="menti-lobby-participants-box">
              <div className="menti-lobby-participants-header">
                <span className="t-label-md">👥 In the room</span>
                <span className="badge badge-primary">{participants.length}</span>
              </div>
              <div className="menti-lobby-participants-list">
                {participants.length === 0 ? (
                  <div className="menti-lobby-waiting">
                    <span className="spinner spinner--sm" />
                    <span>Waiting for students to join with code <strong>{code}</strong>…</span>
                  </div>
                ) : (
                  <div className="menti-lobby-chips-wrap">
                    {participants.map((p) => (
                      <span
                        key={p.id}
                        className="menti-lobby-chip"
                        style={{ opacity: p.connected ? 1 : 0.6 }}
                      >
                        <span style={{ marginRight: '0.35rem' }}>{getAvatar(p.name)}</span> {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <div className="alert alert-error">⚠ {error}</div>}

            {/* Launch Action Bar */}
            <div className="menti-lobby-actions">
              <button className="btn btn-ghost" onClick={newSession} id="back-builder-btn">
                ← Back to builder
              </button>
              <button
                className="btn btn-success btn--lg menti-lobby-start-btn"
                onClick={start}
                id="start-session-btn"
              >
                ▶ Start Quiz · {questionCount} question{questionCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>

          {/* Right Column: QR Code Card */}
          <div className="menti-lobby-right">
            <div className="menti-lobby-qr-card">
              <div className="menti-lobby-qr-frame">
                <QRCodeSVG
                  value={joinUrl}
                  size={195}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#0F172A"
                  style={{ width: '100%', height: 'auto', maxWidth: '195px', maxHeight: '195px' }}
                />
              </div>
              <div className="menti-lobby-qr-caption">
                <span>📱 Scan with your phone camera to join instantly</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  // ─── Ended ────────────────────────────────────────────────────────────────
  if (phase === 'ended') return (
    <div className="page page--ended">
      {sessionNav}
      <div className="main-content" style={{ padding: '1.25rem 1.5rem 3rem' }}>
        <div className="container--showcase">
          <div className="stack stack-6">
            {/* Sleek, compact celebration banner */}
            <div className="final-standings-bar">
              <div className="final-standings-title-wrap">
                <span
                  className="final-standings-crown"
                  onClick={fire4CornerFireworks}
                  role="button"
                  title="Click to launch celebration fireworks! 🎉"
                  style={{ cursor: 'pointer' }}
                >
                  👑
                </span>
                <div>
                  <h1 className="final-standings-heading">Final Standings</h1>
                  <p className="final-standings-subtitle">
                    {finalData?.questions.length ?? questionCount} questions · {leaderboard.length} students
                  </p>
                </div>
              </div>
              <div className="final-standings-btns">
                <button
                  className="btn btn-primary"
                  onClick={newSession}
                  id="top-new-quiz-btn"
                  style={{ fontWeight: 700, padding: '0.55rem 1.4rem', borderRadius: '10px' }}
                >
                  ✨ Start New Quiz
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={exportResultsCsv}
                  id="top-export-csv-btn"
                  style={{ fontWeight: 600, padding: '0.55rem 1.2rem', borderRadius: '10px' }}
                >
                  📥 Export CSV
                </button>
              </div>
            </div>

            {/* 2-Column Full-Page Showcase: Left = Top 3 3D Podium, Right = Top 10 Horizontal Racing Bars */}
            <div className="final-showcase-grid">
              {/* Left Column: 3D Olympic Podium */}
              <div className="final-showcase-card final-showcase-card--podium">
                <div className="final-showcase-card-header">
                  <div className="final-showcase-card-header-left">
                    <span className="final-showcase-icon">🏆</span>
                    <h2 className="final-showcase-card-title">Top 3 Champions</h2>
                  </div>
                  <span className="final-showcase-badge final-showcase-badge--gold">Podium</span>
                </div>
                <div className="final-showcase-podium-body">
                  <OlympicPodium
                    topEntries={leaderboard.slice(0, 3)}
                    showWinnerCard={true}
                  />
                </div>
              </div>

              {/* Right Column: Top 10 Horizontal Racing Bars */}
              <div className="final-showcase-card final-showcase-card--bars">
                <div className="final-showcase-card-header">
                  <div className="final-showcase-card-header-left">
                    <span className="final-showcase-icon">🏁</span>
                    <h2 className="final-showcase-card-title">Top 10 Leaderboard</h2>
                  </div>
                  <span className="final-showcase-badge final-showcase-badge--blue">
                    {Math.min(10, leaderboard.length)} Racers
                  </span>
                </div>
                <div className="final-showcase-bars-body">
                  <Leaderboard
                    entries={leaderboard}
                    prevEntries={prevLeaderboard}
                    variant="projector"
                    limit={10}
                    title=""
                    celebrateKey="final"
                    isFinal={true}
                  />
                </div>
              </div>
            </div>

            {/* Question Breakdown Section - 2 cards per row */}
            {finalData?.questions && finalData.questions.length > 0 && (
              <div className="final-questions-section">
                <div className="final-questions-header">
                  <div className="final-questions-header-left">
                    <span className="final-questions-icon">📊</span>
                    <h2 className="final-questions-title">Questions Review</h2>
                  </div>
                  <span className="final-questions-count">
                    {finalData.questions.length} question{finalData.questions.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="final-questions-grid">
                  {finalData.questions.map((q, idx) => {
                    const agg = finalData.finalResults[q.id];
                    if (!agg) return null;
                    return (
                      <div key={q.id} className="final-question-card stack stack-3">
                        <div className="final-question-card-head">
                          <span className="badge badge-neutral t-label-sm">Q{idx + 1}</span>
                          <p className="final-question-text">{cleanText(q.text)}</p>
                        </div>
                        <hr className="divider" style={{ margin: '0.25rem 0 0.5rem' }} />
                        <div className="final-question-chart-wrap">
                          {q.type === 'mcq' ? (
                            <LiveBarChart aggregated={agg as McqAggregated} correctAnswer={q.correctAnswer} />
                          ) : (
                            <TextResponseList responses={agg as TextAggregated} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="host-bar">
              <button className="btn btn-secondary btn--lg" onClick={exportResultsCsv} id="export-csv-btn">
                📥 Export CSV
              </button>
              <button
                className="btn btn-ghost"
                onClick={toggleSound}
                title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                aria-pressed={!muted}
                id="mute-btn-final"
              >
                {muted ? '🔇' : '🔊'}
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
                <span>Correct answer: <strong>{cleanText(correctAnswer)}</strong></span>
              </div>
            )}
            {/* Racing leaderboard */}
            <div className="menti-stage-card stage-lb-card">
              <Leaderboard
                entries={leaderboard}
                prevEntries={prevLeaderboard}
                variant="projector"
                limit={10}
                showPodium={false}
                title={`⚡ Standings · Question ${currentIndex + 1} of ${questionCount}`}
                subtitle="Top 10 Leaders · Faster responses score higher"
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
                  <div className="row row-2" style={{ alignItems: 'center' }}>
                    <span className="menti-stage-q-num">
                      Question {currentIndex + 1} of {questionCount}
                    </span>
                    {isReadingTime && (
                      <span className="badge badge-primary menti-read-badge">
                        📖 Reading Time ({readSecondsLeft}s)
                      </span>
                    )}
                  </div>
                  <h1 className="menti-stage-question">{cleanText(currentQuestion.text)}</h1>
                </div>
                {/* Countdown timer */}
                {phase === 'question' && timer && (
                  <div className="menti-stage-timer-wrap">
                    <CountdownTimer
                      endsAt={timer.endsAt}
                      unlocksAt={timer.unlocksAt}
                      startedAt={timer.startedAt}
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
              {isReadingTime ? (
                <div className="menti-stage-reading-card">
                  <div className="menti-stage-reading-badge">
                    <span className="menti-stage-reading-icon">📖</span>
                    <span>READ THE QUESTION</span>
                  </div>
                  <h2 className="menti-stage-reading-title">
                    Options unlock in <span className="menti-stage-reading-num">{readSecondsLeft}s</span>
                  </h2>
                  <p className="menti-stage-reading-sub">
                    Focus on the question. Options will appear here and on your phones shortly!
                  </p>
                  <div className="menti-stage-reading-dots">
                    <span className="reading-dot" />
                    <span className="reading-dot" />
                    <span className="reading-dot" />
                  </div>
                </div>
              ) : currentQuestion.type === 'mcq' ? (
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
                            background: hostTheme === 'dark' ? '#151518' : `${color}18`,
                            borderColor: hostTheme === 'dark' ? `${color}70` : `${color}60`,
                            '--opt-color': color,
                          } as React.CSSProperties}
                        >
                          <span
                            className="menti-stage-opt-letter"
                            style={{ background: color }}
                          >
                            {LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="menti-stage-opt-text">{cleanText(opt)}</span>
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

        {/* Latecomers announce themselves here — the top-10 board can't show a
            student on 0 points, and the mentor needs to know they're in. */}
        {joinAlerts.length > 0 && (
          <div className="host-join-toasts" aria-live="polite">
            {joinAlerts.map((a) => (
              <div key={a.id} className="host-join-toast">
                <span aria-hidden="true">{getAvatar(a.name)}</span>
                <strong>{a.name}</strong> joined
              </div>
            ))}
          </div>
        )}

        {/* Full roster, on demand, in every phase — not just the lobby. */}
        {showRoster && (
          <div className="host-roster-panel" role="region" aria-label="Students in the room">
            <div className="host-roster-panel-head">
              <strong>
                👥 {participants.length} in the room
                {participants.some((p) => !p.connected) && (
                  <span className="text-muted" style={{ fontWeight: 500 }}>
                    {' '}· {participants.filter((p) => p.connected).length} connected
                  </span>
                )}
              </strong>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setShowRoster(false)}
                aria-label="Close roster"
              >
                ✕
              </button>
            </div>
            {participants.length === 0 ? (
              <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Nobody has joined yet. Students join with code <strong>{code}</strong>.
              </p>
            ) : (
              <div className="menti-lobby-chips-wrap">
                {participants.map((p) => (
                  <span
                    key={p.id}
                    className="menti-lobby-chip"
                    style={{ opacity: p.connected ? 1 : 0.55 }}
                    title={
                      p.connected
                        ? 'Connected'
                        : 'Disconnected — phone asleep, or wifi dropped. Their score is safe.'
                    }
                  >
                    <span style={{ marginRight: '0.35rem' }}>{getAvatar(p.name)}</span> {p.name}
                    {!p.connected && <span style={{ marginLeft: '0.3rem' }}>💤</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

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
              {isReviewMode ? (
                <span className="chip" style={{ background: 'rgba(245,158,11,0.15)', color: hostTheme === 'dark' ? '#F59E0B' : '#B45309', border: '1px solid rgba(245,158,11,0.3)' }}>
                  👁 Review mode — auto-advance paused
                </span>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}

          {phase === 'leaderboard' && (
            <div className="row row-2" style={{ alignItems: 'center', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={next}
                id="leaderboard-next-btn"
                style={{ fontWeight: 800, padding: '0.55rem 1.4rem', borderRadius: '10px' }}
              >
                {isLastQuestion ? '🏆 View Final Standings' : 'Next Question ➔'}
              </button>

              {autoAdvanceEnabled ? (
                <div className="row row-2" style={{ alignItems: 'center', gap: '0.5rem' }}>
                  <span className="chip chip--pulse">
                    {isLastQuestion ? 'Finishing' : 'Next'} in {autoAdvance}s
                  </span>
                  <button
                    className="btn btn-ghost btn--sm"
                    onClick={() => setAutoPaused((p) => !p)}
                    title={autoPaused ? 'Resume countdown' : 'Pause countdown'}
                  >
                    {autoPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button
                    className="btn btn-ghost btn--sm"
                    onClick={() => {
                      setAutoAdvanceEnabled(false);
                      localStorage.setItem('pollmeter_auto_advance', 'false');
                    }}
                    title="Switch to manual next button"
                  >
                    ⚡ Auto: ON
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn--sm"
                  onClick={() => {
                    setAutoAdvanceEnabled(true);
                    localStorage.setItem('pollmeter_auto_advance', 'true');
                  }}
                  title="Enable automatic 5-second countdown"
                >
                  ⚡ Auto: OFF (Manual)
                </button>
              )}
            </div>
          )}

          <button
            className={`btn btn-ghost host-roster-pill${
              showRoster ? ' host-roster-pill--open' : ''
            }`}
            onClick={() => setShowRoster((v) => !v)}
            title="Students in the room — includes anyone who joined mid-quiz"
            aria-label={`${participants.length} students in the room. Show roster.`}
            aria-expanded={showRoster}
            id="roster-btn"
          >
            👥 {participants.length}
          </button>

          <button
            className="btn btn-ghost"
            onClick={toggleSound}
            title={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-pressed={!muted}
            id="mute-btn"
          >
            {muted ? '🔇' : '🔊'}
          </button>

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
          style={{
            left: `${r.left}%`,
            '--drift': `${r.drift}px`,
            animationDuration: `${r.duration}s`,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
