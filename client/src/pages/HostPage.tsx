import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { getAuthUser, getAuthToken, clearStoredAuth, AuthUser, fetchBatches, fetchBatchObjects, BatchObject, createMentorBatch, refreshAuthUser, isFacultyEmail, fetchSubjects, updateMentorProfile } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';
import MentorPinModal from '../components/MentorPinModal';
import MentorQuizHistoryModal from '../components/MentorQuizHistoryModal';
import QuizLibrary from '../components/QuizLibrary';
import BatchPicker from '../components/BatchPicker';
import { createQuizDraft, updateQuizDraft } from '../auth';
import { getActiveTheme, toggleTheme, Theme } from '../theme';
import LiveSessionRoom from './mentor/LiveSessionRoom';
import QuizSetupScreen from './mentor/QuizSetupScreen';

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
  const navigate = useNavigate();
  const [inSession, setInSession] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [aiInitialTopic, setAiInitialTopic] = useState('');
  const [quizSubject, setQuizSubject] = useState(() => getAuthUser()?.subject || '');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [showProfileSubjectPrompt, setShowProfileSubjectPrompt] = useState(() => {
    try {
      return sessionStorage.getItem('pollmeter_dismissed_subject_prompt') !== 'true';
    } catch {
      return true;
    }
  });
  const [savingProfileSubject, setSavingProfileSubject] = useState(false);
  const [profileSubjectError, setProfileSubjectError] = useState('');
  const [showProfileNewSubjectInput, setShowProfileNewSubjectInput] = useState(false);
  const [profileNewSubjectText, setProfileNewSubjectText] = useState('');
  const [showBuilderNewSubject, setShowBuilderNewSubject] = useState(false);
  const [builderNewSubjectName, setBuilderNewSubjectName] = useState('');
  const [quizBatch, setQuizBatch] = useState('');
  const [quizBatchId, setQuizBatchId] = useState('');
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const [availableBatchObjects, setAvailableBatchObjects] = useState<BatchObject[]>([]);
  const [showNewBatchInput, setShowNewBatchInput] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [hostTheme, setHostTheme] = useState<Theme>(getActiveTheme());

  // Keep data-theme attribute synchronized on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', hostTheme);
  }, [hostTheme]);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(() => !getAuthUser());
  const [showPinModal, setShowPinModal] = useState(() => {
    const u = getAuthUser();
    return Boolean(u && !isFacultyEmail(u.email) && u.role !== 'mentor' && u.role !== 'admin');
  });
  const [hostView, setHostView] = useState<'builder' | 'library' | 'reports'>('builder');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftTitle, setEditingDraftTitle] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedToast, setDraftSavedToast] = useState<{ message: string; draftId: string } | null>(null);

  const [batchesLoading, setBatchesLoading] = useState(false);

  // Fetch college batches dynamically with role & assignment awareness (Gap 4)
  const loadBatches = useCallback(() => {
    setBatchesLoading(true);
    fetchBatchObjects()
      .then((objs) => {
        setAvailableBatchObjects(objs || []);
        setAvailableBatches((objs || []).map((o) => o.displayName));
        if (objs && objs.length > 0) {
          setShowNewBatchInput(false);
          setQuizBatchId((prev) => (prev && objs.some((b) => b.id === prev) ? prev : objs[0].id));
          setQuizBatch((prev) => (prev && objs.some((b) => b.displayName === prev) ? prev : objs[0].displayName));
        } else {
          setQuizBatchId('');
          setQuizBatch('');
          setShowNewBatchInput(false);
        }
      })
      .catch(() => {
        setAvailableBatchObjects([]);
        setAvailableBatches([]);
        setShowNewBatchInput(false);
      })
      .finally(() => {
        setBatchesLoading(false);
      });
  }, []);

  // Load campus subjects dynamically
  const loadSubjects = useCallback(() => {
    fetchSubjects()
      .then((subs) => {
        if (subs && subs.length > 0) setAvailableSubjects(subs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBatches();
    loadSubjects();
  }, [authUser, loadBatches, loadSubjects]);

  // Handler: save primary subject to mentor profile
  const handleSaveProfileSubject = async (subj: string) => {
    const trimmed = subj.trim();
    if (!trimmed) {
      setProfileSubjectError('Please select or enter a subject.');
      return;
    }
    setSavingProfileSubject(true);
    setProfileSubjectError('');
    try {
      const res = await updateMentorProfile({ subject: trimmed });
      if (res?.user) setAuthUser(res.user);
      setQuizSubject(trimmed);
      setAvailableSubjects((prev) => {
        if (!prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
          return [trimmed, ...prev].sort((a, b) => a.localeCompare(b));
        }
        return prev;
      });
      setShowProfileSubjectPrompt(false);
      setShowProfileNewSubjectInput(false);
      setProfileNewSubjectText('');
      try { sessionStorage.removeItem('pollmeter_dismissed_subject_prompt'); } catch {}
    } catch (err: any) {
      setProfileSubjectError(err.message || 'Failed to update mentor profile subject.');
    } finally {
      setSavingProfileSubject(false);
    }
  };

  // Handler: add a subject from within the quiz builder
  const handleAddBuilderSubject = () => {
    const trimmed = builderNewSubjectName.trim();
    if (!trimmed) return;
    setQuizSubject(trimmed);
    setAvailableSubjects((prev) => {
      if (!prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
        return [trimmed, ...prev].sort((a, b) => a.localeCompare(b));
      }
      return prev;
    });
    // If mentor doesn't have a profile subject yet, set it automatically
    if (authUser && !authUser.subject) {
      updateMentorProfile({ subject: trimmed })
        .then((res) => { if (res?.user) setAuthUser(res.user); })
        .catch(() => {});
    }
    setShowBuilderNewSubject(false);
    setBuilderNewSubjectName('');
  };

  // Handler: create a new batch inline
  const handleCreateBatch = async () => {
    const name = newBatchName.trim();
    if (!name) { setBatchError('Please enter a batch name.'); return; }
    if (name.length > 100) { setBatchError('Name must be 100 characters or fewer.'); return; }
    setCreatingBatch(true);
    setBatchError('');
    try {
      const created = await createMentorBatch(name);
      setAvailableBatchObjects((prev) => {
        const filtered = prev.filter((b) => b.id !== created.id && b.displayName !== created.displayName);
        const updated = [...filtered, created];
        return updated.sort((a, b) => a.displayName.localeCompare(b.displayName));
      });
      setAvailableBatches((prev) => {
        const filtered = prev.filter((b) => b !== created.displayName);
        const updated = [...filtered, created.displayName];
        return updated.sort();
      });
      setQuizBatchId(created.id);
      setQuizBatch(created.displayName);
      setNewBatchName('');
      setShowNewBatchInput(false);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to create batch.');
    } finally {
      setCreatingBatch(false);
    }
  };

  // Ask the server what this account may actually do. Goes through
  // `refreshAuthUser` so a re-issued token (an approval or a revocation since
  // this one was minted) replaces the stored one — the inline fetch this
  // replaced kept writing the old token back alongside the new role.
  useEffect(() => {
    refreshAuthUser()
      .then((synced) => {
        if (synced) {
          setAuthUser(synced);
          if (synced.role === 'mentor' || synced.role === 'admin') {
            setShowPinModal(false);
          }
          if (synced.subject && !quizSubject) {
            setQuizSubject(synced.subject);
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

    if (!quizBatchId) {
      setError('Please select or create a batch before starting the session.');
      return;
    }

    setLoading(true);

    try {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        setShowAuthModal(true);
        return;
      }
      const topic = aiInitialTopic || (questions[0]?.text ? `Quiz: ${questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');

      // No `hostEmail` / `hostName` in the body: the server takes the host
      // identity from this token and ignores anything the client claims.
      // Sending them anyway would suggest they still carry weight, and the
      // whole point of per-mentor report isolation is that they must not.
      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questions,
          topic,
          subject: quizSubject || 'General',
          batchId: quizBatchId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          const synced = await refreshAuthUser();
          if (synced && (synced.role === 'mentor' || synced.role === 'admin' || isFacultyEmail(synced.email))) {
            setAuthUser(synced);
            const freshToken = getAuthToken();
            if (freshToken) {
              const retryRes = await fetch(apiUrl('/api/sessions'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${freshToken}`,
                },
                body: JSON.stringify({
                  questions,
                  topic,
                  subject: quizSubject || 'General',
                  batchId: quizBatchId,
                }),
              });
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                credentials.current = { code: retryData.code, hostId: retryData.hostId };
                localStorage.setItem(HOST_LS_KEY, JSON.stringify(credentials.current));
                setCode(retryData.code);
                setQuestionCount(questions.length);
                setPhase('lobby');
                setInSession(true);
                socket.emit('host_join', { code: retryData.code, hostId: retryData.hostId });
                return;
              }
            }
          }
        }
        throw new Error(d.error ?? 'Could not create the session.');
      }

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

  const handleSaveDraft = async () => {
    setError('');
    setDraftSavedToast(null);
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    if (authUser.role !== 'mentor' && authUser.role !== 'admin') {
      setShowPinModal(true);
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question before saving as draft.');
      return;
    }

    setSavingDraft(true);
    try {
      const title = aiInitialTopic.trim() || (questions[0]?.text ? `Quiz: ${questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');
      const subject = quizSubject || 'General';

      if (editingDraftId) {
        const updated = await updateQuizDraft(editingDraftId, {
          title,
          subject,
          questions,
        });
        setEditingDraftTitle(updated.title);
        setDraftSavedToast({ message: `Draft "${updated.title}" updated successfully.`, draftId: updated.id });
      } else {
        const created = await createQuizDraft({
          title,
          subject,
          questions,
        });
        setEditingDraftId(created.id);
        setEditingDraftTitle(created.title);
        setDraftSavedToast({ message: `Draft "${created.title}" saved to your library!`, draftId: created.id });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const launchSessionFromDraft = async (draftId: string, batchId: string, batchName: string) => {
    setError('');
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setShowAuthModal(true);
        throw new Error('Authentication required');
      }

      const res = await fetch(apiUrl('/api/sessions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          draftId,
          batchId,
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error || 'Failed to start live session.');
      }

      credentials.current = { code: d.code, hostId: d.hostId };
      localStorage.setItem(HOST_LS_KEY, JSON.stringify(credentials.current));
      setCode(d.code);
      setQuizBatchId(batchId);
      setQuizBatch(batchName);
      setQuestionCount(d.questions?.length || 0);
      setQuestions(d.questions || []);
      setPhase('lobby');
      setInSession(true);
      socket.emit('host_join', { code: d.code, hostId: d.hostId });
    } finally {
      setLoading(false);
    }
  };

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


  // ─── Builder screen ───────────────────────────────────────────────────────
  if (!inSession) {
    return (
      <QuizSetupScreen
        onSessionStarted={({ code: newCode, hostId }) => {
          credentials.current = { code: newCode, hostId };
          setCode(newCode);
          setPhase("lobby");
          setInSession(true);
          socket.emit("host_join", { code: newCode, hostId });
        }}
      />
    );
  }

  return (
    <LiveSessionRoom
      code={code}
      phase={phase}
      participants={participants}
      showRoster={showRoster}
      setShowRoster={setShowRoster}
      joinAlerts={joinAlerts}
      currentQuestion={currentQuestion}
      currentIndex={currentIndex}
      questionCount={questionCount}
      results={results}
      answeredCount={answeredCount}
      correctAnswer={correctAnswer}
      timer={timer}
      leaderboard={leaderboard}
      prevLeaderboard={prevLeaderboard}
      finalData={finalData}
      reactions={reactions}
      isReviewMode={isReviewMode}
      resultsAdvance={resultsAdvance}
      resultsPaused={resultsPaused}
      setResultsPaused={setResultsPaused}
      autoAdvanceEnabled={autoAdvanceEnabled}
      setAutoAdvanceEnabled={setAutoAdvanceEnabled}
      autoAdvance={autoAdvance}
      autoPaused={autoPaused}
      setAutoPaused={setAutoPaused}
      readSecondsLeft={readSecondsLeft}
      isReadingTime={isReadingTime}
      lanIp={lanIp}
      copied={copied}
      isFullscreen={isFullscreen}
      toggleFullscreen={toggleFullscreen}
      hostTheme={hostTheme}
      setHostTheme={setHostTheme}
      muted={muted}
      toggleSound={toggleSound}
      error={error}
      start={start}
      lockAnswers={lockAnswers}
      showLeaderboard={showLeaderboard}
      next={next}
      previous={previous}
      extendTime={extendTime}
      endSession={endSession}
      newSession={newSession}
      copyJoinLink={copyJoinLink}
      exportResultsCsv={exportResultsCsv}
    />
  );
}
