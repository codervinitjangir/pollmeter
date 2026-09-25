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
  SocketErrorPayload,
} from '../types';
import QuestionForm from '../components/QuestionForm';
import { QRCodeSVG } from 'qrcode.react';
import LiveBarChart from '../components/LiveBarChart';
import TextResponseList from '../components/TextResponseList';
import CountdownTimer from '../components/CountdownTimer';
import { playCue, unlockAudio, isMuted, toggleMuted } from '../sounds';
import Leaderboard, { OlympicPodium, fire4CornerFireworks } from '../components/Leaderboard';
import AIGenerateModal from '../components/AIGenerateModal';
import { apiUrl } from '../api';
import { cleanText } from '../cleanText';
import { getAvatar } from '../utils/avatars';
import { getAuthUser, getAuthToken, setStoredAuth, clearStoredAuth, AuthUser } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';
import MentorPinModal from '../components/MentorPinModal';
import MentorQuizHistoryModal from '../components/MentorQuizHistoryModal';

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
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(() => !getAuthUser());
  const [showPinModal, setShowPinModal] = useState(() => {
    const u = getAuthUser();
    return Boolean(u && u.role !== 'mentor' && u.role !== 'admin');
  });
  const [showPastQuizzes, setShowPastQuizzes] = useState(false);

  // Synchronize auth state and auto-detect whitelisted mentors
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setStoredAuth(token, data.user);
          setAuthUser(data.user);
          if (data.user.role === 'mentor' || data.user.role === 'admin') {
            setShowPinModal(false);
          }
        }
      })
      .catch(() => {});
  }, []);

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
        localStorage.removeItem(HOST_LS_KEY);
        credentials.current = null;
        setInSession(false);
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
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    if (authUser.role !== 'mentor' && authUser.role !== 'admin') {
      setShowPinModal(true);
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    setLoading(true);
    try {
      const token = getAuthToken();
      const topic = aiInitialTopic || (questions[0]?.text ? `Quiz: ${questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');

      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          questions,
          topic,
          hostEmail: authUser.email,
          hostName: authUser.realName,
        }),
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
    if (!inSession) {
      prevPhase.current = null;
      return;
    }
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
  }, [phase, inSession]);

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

  function scrollToBuilder() {
    builderRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function openWithTopic(topicPrompt: string) {
    setAiInitialTopic(topicPrompt);
    setShowAI(true);
  }

  function startNewScored() {
    setEditing(null);
    scrollToBuilder();
  }

  function startNewPoll() {
    setEditing({
      id: '',
      type: 'mcq',
      text: '',
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      timeLimitSeconds: 20,
    });
    scrollToBuilder();
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
      <CollegeAuthModal
        isOpen={showAuthModal || !authUser}
        title="Medhavi Faculty &amp; Mentor Portal"
        subtitle="Sign in with your official college email ID to host quizzes and manage students"
        onSuccess={(user) => {
          setAuthUser(user);
          setShowAuthModal(false);
          if (user.role !== 'mentor' && user.role !== 'admin') {
            setShowPinModal(true);
          }
        }}
        onClose={authUser ? () => setShowAuthModal(false) : undefined}
        roleHint="mentor"
      />

      <MentorPinModal
        isOpen={showPinModal}
        currentUser={authUser}
        onSuccess={(updated) => {
          setAuthUser(updated);
          setShowPinModal(false);
        }}
        onCancel={() => {
          setShowPinModal(false);
        }}
      />

      <MentorQuizHistoryModal
        isOpen={showPastQuizzes}
        onClose={() => setShowPastQuizzes(false)}
      />

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
              onClick={() => {
                setActiveNav('home');
                mainPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
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
            <button
              className="menti-nav-link"
              onClick={() => setShowPastQuizzes(true)}
              id="past-quizzes-sidebar-btn"
            >
              <span>📊</span> Past Quizzes &amp; Reports
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
          <button className="menti-nav-link" onClick={() => setShowHowItWorks(true)}><span>📖</span> How it works</button>
        </div>
      </aside>

      <div ref={mainPanelRef} className="menti-main-panel">
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
            {authUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span className="pm-auth-profile-badge">
                  🎓 {authUser.realName} {authUser.role === 'mentor' || authUser.role === 'admin' ? '(Faculty)' : ''}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn--sm"
                  onClick={() => setShowPastQuizzes(true)}
                  id="topbar-past-quizzes-btn"
                >
                  📊 Past Quizzes
                </button>
                <button
                  type="button"
                  className="pm-auth-signout-btn"
                  onClick={() => {
                    clearStoredAuth();
                    setAuthUser(null);
                    setShowAuthModal(true);
                  }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn--sm"
                onClick={() => setShowAuthModal(true)}
              >
                Sign In with College ID
              </button>
            )}
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

        {showHowItWorks && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowHowItWorks(false)}>
            <div className="modal stack stack-5" role="dialog" aria-label="How PollMeter Works" style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <div className="stack stack-1">
                  <p className="t-title" style={{ fontSize: '1.35rem' }}>📖 How PollMeter Works</p>
                  <p className="t-body-sm text-secondary">3 simple steps to run a live interactive classroom quiz</p>
                </div>
                <button className="btn btn-ghost btn--icon" onClick={() => setShowHowItWorks(false)} aria-label="Close">✕</button>
              </div>

              <div className="stack stack-3" style={{ gap: '1rem' }}>
                <div className="row row-3" style={{ alignItems: 'flex-start', background: '#F8FAFC', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>✨</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: '#0F172A', fontSize: '0.95rem' }}>1. Build or Generate Quiz</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Paste your syllabus/topics into <strong>Generate with AI</strong> or create custom MCQs with custom timers.
                    </p>
                  </div>
                </div>

                <div className="row row-3" style={{ alignItems: 'flex-start', background: '#F8FAFC', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>📱</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: '#0F172A', fontSize: '0.95rem' }}>2. Project &amp; Connect Students</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Click <strong>&quot;Get the join code&quot;</strong> and full-screen on projector. Students scan QR code to join instantly (no app download needed).
                    </p>
                  </div>
                </div>

                <div className="row row-3" style={{ alignItems: 'flex-start', background: '#F8FAFC', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>🏁</span>
                  <div className="stack stack-1 flex-1">
                    <strong style={{ color: '#0F172A', fontSize: '0.95rem' }}>3. Play, Race &amp; Review</strong>
                    <p className="t-body-sm text-secondary" style={{ margin: 0 }}>
                      Launch questions with speed bonus scoring. Watch scores surge on the <strong>60FPS racing leaderboard</strong> with streak badges, then review answers together!
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button className="btn btn-primary btn--lg" onClick={() => setShowHowItWorks(false)} style={{ width: '100%', borderRadius: '10px' }}>
                  Got it, let&apos;s start! 🚀
                </button>
              </div>
            </div>
          </div>
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

            <div
              className="menti-card-mini"
              onClick={startNewScored}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startNewScored()}
            >
              <div className="menti-mini-badge">
                <span style={{ color: '#6366F1', fontSize: '1.2rem' }}>◆</span>
                <span>Scored quiz</span>
              </div>
              <p className="menti-mini-desc">
                Mark the right option — correct answers score 1000 plus a speed bonus.
              </p>
              <button className="menti-mini-arrow" onClick={(e) => { e.stopPropagation(); startNewScored(); }} aria-label="Build a scored quiz">→</button>
            </div>

            <div
              className="menti-card-mini"
              onClick={startNewPoll}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && startNewPoll()}
            >
              <div className="menti-mini-badge">
                <span style={{ color: '#EC4899', fontSize: '1.2rem' }}>●</span>
                <span>Poll</span>
              </div>
              <p className="menti-mini-desc">
                Leave the answer unmarked and the bars fill live. No scoring.
              </p>
              <button className="menti-mini-arrow" onClick={(e) => { e.stopPropagation(); startNewPoll(); }} aria-label="Build a poll">→</button>
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
                  Scored multiple choice, True / False, or live audience polls.
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
    <div className="page">
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
                <span className="chip" style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309', border: '1px solid rgba(245,158,11,0.3)' }}>
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
