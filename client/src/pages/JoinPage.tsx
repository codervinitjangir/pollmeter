import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import socket from '../socket';
import {
  PublicQuestion,
  SessionPhase,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  SessionStatePayload,
  QuestionStartedPayload,
  QuestionReviewedPayload,
  PhaseChangedPayload,
  ResponseCountPayload,
  ResultsRevealedPayload,
  SessionEndedPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  ResponseAcceptedPayload,
  TimerUpdatedPayload,
  SocketErrorPayload,
} from '../types';
import CountdownTimer from '../components/CountdownTimer';
import LiveBarChart from '../components/LiveBarChart';
import TextResponseList from '../components/TextResponseList';
import Leaderboard from '../components/Leaderboard';
import { cleanText } from '../cleanText';
import { getAvatar } from '../utils/avatars';
import { triggerHaptic } from '../utils/haptics';
import { getVerdictQuote } from '../utils/verdictQuotes';
import { getAuthUser, getAuthToken, clearStoredAuth, AuthUser } from '../auth';
import CollegeAuthModal from '../components/CollegeAuthModal';
import StudentQuizHistoryModal from '../components/StudentQuizHistoryModal';

const LS_KEY = 'pollsync_participant';

/**
 * `rejoinToken` is the private half of the student's identity. Without it a
 * phone that locks its screen comes back as a brand-new participant — losing
 * the score and showing the same student twice on the projected leaderboard.
 */
interface StoredSession {
  code: string;
  participantId: string;
  rejoinToken: string;
  name: string;
}

function loadStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.code || !parsed.participantId || !parsed.rejoinToken || !parsed.name) return null;
    return parsed as StoredSession;
  } catch {
    localStorage.removeItem(LS_KEY);
    return null;
  }
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const OPTION_COLORS = ['#3952D3', '#25B57F', '#FF7A45', '#7C3AED', '#F59E0B', '#EF4444'];

export default function JoinPage() {
  // Join form
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getAuthUser());
  const [showAuthModal, setShowAuthModal] = useState(() => !getAuthUser());
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Server-authoritative session state. The screen is derived from `phase`
  // rather than a second local step machine that could drift out of sync.
  const [phase, setPhase] = useState<SessionPhase>('lobby');
  const [sessionCode, setSessionCode] = useState('');
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [results, setResults] = useState<AggregatedResult | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState<string | undefined>();
  const [timer, setTimer] = useState<{
    endsAt: number;
    durationSeconds: number;
    startedAt?: number;
    unlocksAt?: number | null;
    readTimeSeconds?: number | null;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  // My answer + result for the question on screen
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ResponseAcceptedPayload | null>(null);
  const [openTextInput, setOpenTextInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  /**
   * Set when the server says the session — or our place in it — no longer
   * exists. In practice that means the backend restarted (a redeploy or crash
   * clears the in-memory store) while phones were still on a question screen.
   * Until now that error landed in `submitError`: one small line under a
   * question that still looked live, re-fired on every reconnect attempt, with
   * no way forward. A dead session has to say so and offer a way back in.
   */
  const [sessionLost, setSessionLost] = useState('');
  const [localReactions, setLocalReactions] = useState<Array<{ id: string; emoji: string; left: number }>>([]);

  const identity = useRef<StoredSession | null>(null);
  // Read inside socket callbacks without making them a dependency — keying the
  // listener effect on `nameInput` re-registered every handler on each keystroke.
  const pendingName = useRef('');
  const joinedRef = useRef(false);
  const submittingRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((next: StoredSession) => {
    identity.current = next;
    joinedRef.current = true;
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }, []);

  const doJoin = useCallback((code: string, name: string, stored?: StoredSession | null) => {
    pendingName.current = name;
    setJoining(true);
    setJoinError('');

    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = setTimeout(() => {
      if (!joinedRef.current) {
        setJoining(false);
        setJoinError('Connection timed out. Check if you are on the same Wi-Fi / Hotspot as the host.');
      }
    }, 8000);

    if (!socket.connected) socket.connect();
    const authToken = getAuthToken();
    const currentAuth = getAuthUser();

    socket.emit('join_session', {
      code: code.trim(),
      name: name.trim(),
      // Both halves, or the server treats this as a fresh student.
      participantId: stored?.code === code.trim() ? stored.participantId : undefined,
      rejoinToken: stored?.code === code.trim() ? stored.rejoinToken : undefined,
      authToken: authToken || undefined,
      realName: currentAuth?.realName,
      email: currentAuth?.email,
    });
  }, []);

  /** Clears everything tied to the question currently on screen. */
  function resetForNewQuestion() {
    submittingRef.current = false;
    setMyAnswer(null);
    setFeedback(null);
    setOpenTextInput('');
    setSubmitError('');
    setResults(null);
    setCorrectAnswer(undefined);
    setSubmitting(false);
  }

  // ─── Prefill from the QR link, then try to resume ──────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    const stored = loadStored();
    if (stored) identity.current = stored;

    if (codeParam && /^\d{6}$/.test(codeParam)) setCodeInput(codeParam);
    else if (stored) setCodeInput(stored.code);
    if (stored) setNameInput(stored.name);
  }, []);

  // ─── Socket wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    function onConnect() {
      setConnected(true);
      // Reconnected after a wifi drop: resume the same identity silently.
      const stored = identity.current;
      if (stored && joinedRef.current) doJoin(stored.code, stored.name, stored);
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onSessionState(p: SessionStatePayload) {
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      persist({
        code: p.code,
        participantId: p.participantId,
        rejoinToken: p.rejoinToken,
        name: p.name || pendingName.current,
      });

      setJoined(true);
      setJoining(false);
      setJoinError('');
      setSessionCode(p.code);
      setPhase(p.phase);
      setQuestionCount(p.questionCount);
      setCurrentIndex(p.currentIndex);
      setQuestion(p.question);
      setResults(p.results);
      setAnsweredCount(p.responseCount);
      setParticipantCount(p.participantCount);
      setCorrectAnswer(p.correctAnswer);
      setLeaderboard(p.leaderboard ?? []);
      setMyAnswer(p.myAnswer);
      setFeedback(p.myFeedback);
      setSubmitting(false);
      setNameInput(p.name || pendingName.current);

      if (p.question && p.timerEndsAt) {
        setTimer({
          endsAt: p.timerEndsAt,
          startedAt: p.timerStartedAt ?? undefined,
          unlocksAt: p.unlocksAt,
          readTimeSeconds: p.readTimeSeconds,
          durationSeconds: p.question.timeLimitSeconds,
        });
      } else {
        setTimer(null);
      }
    }

    function onQuestionStarted(p: QuestionStartedPayload) {
      resetForNewQuestion();
      setPhase('question');
      setQuestion(p.question);
      setCurrentIndex(p.index);
      setQuestionCount(p.questionCount);
      setAnsweredCount(0);
      setTimer({
        endsAt: p.timerEndsAt,
        startedAt: p.timerStartedAt,
        unlocksAt: p.unlocksAt,
        readTimeSeconds: p.readTimeSeconds,
        durationSeconds: p.question.timeLimitSeconds,
      });
    }

    function onPhaseChanged(p: PhaseChangedPayload) {
      setPhase(p.phase);
      setCurrentIndex(p.currentIndex);
      setQuestionCount(p.questionCount);
    }

    /**
     * The mentor stepped back to a question the class already answered. Put it
     * back on screen with answers closed — `results_revealed` and
     * `response_feedback` follow immediately and restore the recorded
     * distribution and this student's own answer.
     */
    function onQuestionReviewed(p: QuestionReviewedPayload) {
      resetForNewQuestion();
      setPhase('results');
      setQuestion(p.question);
      setCurrentIndex(p.index);
      setQuestionCount(p.questionCount);
      setTimer(null);
    }

    function onTimerUpdated(p: TimerUpdatedPayload) {
      if (!p.timerEndsAt) return;
      setTimer((prev) => (prev ? { ...prev, endsAt: p.timerEndsAt! } : prev));
    }

    function onResponseCount(p: ResponseCountPayload) {
      setAnsweredCount(p.responseCount);
      setParticipantCount(p.participantCount);
      // Only ever present for ungraded polls — watching a poll fill in is the
      // point of a poll, while a graded question must stay hidden.
      if (p.results) setResults(p.results);
    }

    function onResultsRevealed(p: ResultsRevealedPayload) {
      setPhase('results');
      setResults(p.aggregated);
      setAnsweredCount(p.responseCount);
      setParticipantCount(p.participantCount);
      setCorrectAnswer(p.correctAnswer);
    }

    function onResponseSubmitted(p: { questionId: string; value: string }) {
      submittingRef.current = false;
      setSubmitting(false);
      setMyAnswer(p.value);
      setSubmitError('');
    }

    function onResponseFeedback(p: ResponseAcceptedPayload & { correctAnswer?: string }) {
      submittingRef.current = false;
      setSubmitting(false);
      setFeedback(p);
      setMyAnswer(p.value);
      if (p.correctAnswer) setCorrectAnswer(p.correctAnswer);

      if (p.graded) {
        if (p.isCorrect) {
          triggerHaptic('correct');
          try {
            confetti({
              particleCount: 45,
              spread: 65,
              origin: { y: 0.65 },
              disableForReducedMotion: true,
            });
          } catch {}
        } else {
          triggerHaptic('wrong');
        }
      }
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
      setTimer(null);
      localStorage.removeItem(LS_KEY);
      joinedRef.current = false;
    }

    function onConnectError() {
      setConnected(false);
      if (!joinedRef.current) {
        if (joinTimeoutRef.current) {
          clearTimeout(joinTimeoutRef.current);
          joinTimeoutRef.current = null;
        }
        setJoining(false);
        setJoinError('Cannot connect to quiz server. Please check your Wi-Fi or network.');
      }
    }

    function onError(p: SocketErrorPayload) {
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      setJoining(false);

      // `fatal` while already joined is the server-restart case. Tear the stored
      // identity down: it names a session that no longer exists, so leaving it
      // in place makes `onConnect` re-request it on every reconnect and refire
      // this same error for as long as the student keeps the tab open.
      if (p.fatal && joinedRef.current) {
        joinedRef.current = false;
        submittingRef.current = false;
        localStorage.removeItem(LS_KEY);
        identity.current = null;
        setSessionLost(p.message || 'This session is no longer available.');
        setTimer(null);
        setSubmitting(false);
        return;
      }

      if (!joinedRef.current) {
        setJoinError(p.message || 'Unable to join session.');
        // A stale identity from a finished session must not block a fresh join.
        localStorage.removeItem(LS_KEY);
        identity.current = null;
      } else {
        setSubmitError(p.message);
        // Roll back optimistic answer if server rejected the submission
        if (submittingRef.current) {
          setMyAnswer(null);
          submittingRef.current = false;
        }
      }
      setSubmitting(false);
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('session_state', onSessionState);
    socket.on('question_started', onQuestionStarted);
    socket.on('question_reviewed', onQuestionReviewed);
    socket.on('phase_changed', onPhaseChanged);
    socket.on('timer_updated', onTimerUpdated);
    socket.on('response_count', onResponseCount);
    socket.on('results_revealed', onResultsRevealed);
    socket.on('response_submitted', onResponseSubmitted);
    socket.on('response_feedback', onResponseFeedback);
    socket.on('leaderboard_updated', onLeaderboardUpdated);
    socket.on('session_ended', onSessionEnded);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('session_state', onSessionState);
      socket.off('question_started', onQuestionStarted);
      socket.off('question_reviewed', onQuestionReviewed);
      socket.off('phase_changed', onPhaseChanged);
      socket.off('timer_updated', onTimerUpdated);
      socket.off('response_count', onResponseCount);
      socket.off('results_revealed', onResultsRevealed);
      socket.off('response_submitted', onResponseSubmitted);
      socket.off('response_feedback', onResponseFeedback);
      socket.off('leaderboard_updated', onLeaderboardUpdated);
      socket.off('session_ended', onSessionEnded);
      socket.off('error', onError);
    };
  }, [doJoin, persist]);

  // Resume once on mount if we already hold a full identity.
  useEffect(() => {
    const stored = identity.current ?? loadStored();
    if (!stored) return;
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam !== stored.code) return;   // scanned a different class
    doJoin(stored.code, stored.name, stored);
  }, [doJoin]);

  // Celebratory confetti burst & haptic feedback when session wraps up
  useEffect(() => {
    if (phase === 'ended') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([100, 50, 100, 50, 200]); } catch {}
      }
      try {
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.35 },
          disableForReducedMotion: true,
        });
        const timer = setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.6 },
            disableForReducedMotion: true,
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.6 },
            disableForReducedMotion: true,
          });
        }, 400);
        return () => clearTimeout(timer);
      } catch {}
    }
  }, [phase]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser) {
      setShowAuthModal(true);
      return;
    }
    const code = codeInput.trim();
    const name = nameInput.trim();

    if (!/^\d{6}$/.test(code)) {
      setJoinError('Please enter the 6-digit code from the screen.');
      return;
    }
    if (!name) {
      setJoinError('Please choose your screen nickname for this quiz.');
      return;
    }
    doJoin(code, name, identity.current);
  }

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
    const id = setInterval(update, 150);
    return () => clearInterval(id);
  }, [timer?.unlocksAt]);

  const isReadingBuffer = Boolean(timer?.unlocksAt && readSecondsLeft > 0);
  const answersOpen = phase === 'question' && myAnswer == null && !isReadingBuffer;

  // Student Laptop Anti-Cheat Shield
  const [isDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768 && !('ontouchstart' in window && window.innerWidth < 1024);
  });
  const [isStudentFullscreen, setIsStudentFullscreen] = useState(false);
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false);

  useEffect(() => {
    function onFsChange() {
      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );
      setIsStudentFullscreen(isFs);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    document.addEventListener('mozfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      document.removeEventListener('mozfullscreenchange', onFsChange);
    };
  }, []);

  function enterStudentFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // Detect tab switch or window blur during question answering
  useEffect(() => {
    if (!joined || phase !== 'question') return;

    // Start each question clean, otherwise one stray warning follows a student
    // through the rest of the quiz.
    setTabSwitchWarning(false);

    // On a phone, `blur` fires when the on-screen keyboard opens or a
    // notification slides in — neither is cheating, and accusing most of the
    // room of it would be worse than missing a real tab switch.
    // `visibilitychange` is accurate on both, so only laptops get `blur`.
    const isTouch = navigator.maxTouchPoints > 0;

    function onVisibility() {
      if (document.hidden) {
        setTabSwitchWarning(true);
      }
    }

    function onBlur() {
      setTabSwitchWarning(true);
    }

    document.addEventListener('visibilitychange', onVisibility);
    if (!isTouch) window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (!isTouch) window.removeEventListener('blur', onBlur);
    };
  }, [joined, phase]);

  function submitValue(value: string) {
    if (!question || !identity.current) return;
    if (!answersOpen || submitting) return;

    triggerHaptic('lock');

    setMyAnswer(value);        // optimistic, so the tap feels instant
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    socket.emit('submit_response', {
      code: identity.current.code,
      questionId: question.id,
      value,
    });
  }

  function submitOpenText() {
    const value = openTextInput.trim();
    if (!value) {
      setSubmitError('Please type your answer.');
      return;
    }
    submitValue(value);
  }

  function sendReaction(emoji: string) {
    triggerHaptic('reaction');
    const id = Math.random().toString(36).slice(2);
    const left = 20 + Math.random() * 60;
    setLocalReactions((prev) => [...prev.slice(-5), { id, emoji, left }]);
    setTimeout(() => setLocalReactions((prev) => prev.filter((r) => r.id !== id)), 2000);

    const code = sessionCode || identity.current?.code;
    if (code) socket.emit('send_reaction', { code, emoji });
  }

  function leaveSession() {
    localStorage.removeItem(LS_KEY);
    identity.current = null;
    joinedRef.current = false;
    setJoined(false);
    setPhase('lobby');
    setCodeInput('');
    setQuestion(null);
    setFinalData(null);
    resetForNewQuestion();
  }

  const myParticipantId = identity.current?.participantId;
  const myEntry = leaderboard.find((e) => e.participantId === myParticipantId);
  const myName = identity.current?.name || nameInput;

  const reactionsDock = (
    <>
      {localReactions.map((r) => (
        <span
          key={r.id}
          className="floating-reaction"
          style={{
            left: `${r.left}%`,
            animationDuration: '2s',
          }}
          aria-hidden="true"
        >
          {r.emoji}
        </span>
      ))}
      <div className="reactions-dock" role="toolbar" aria-label="Classroom reactions">
        {['🔥', '🎉', '🤯', '❤️', '👏', '😂'].map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-btn"
            onClick={() => sendReaction(emoji)}
            title={`Send ${emoji} to the screen`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );

  const topNav = (
    <nav className="nav">
      <span className="nav-logo">
        <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 9H11V27H6V9Z" fill="currentColor" />
          <rect x="14" y="14" width="5" height="13" rx="1" fill="#F59E0B" />
          <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
        </svg>
        <span style={{ fontWeight: 800 }}>PollMeter</span>
      </span>
      <div className="row row-2">
        {!connected && <span className="badge badge-warning t-label-sm">Reconnecting…</span>}
        {connected && <span className="badge badge-live">Live</span>}
        {questionCount > 0 && <span className="chip">Q{currentIndex + 1}/{questionCount}</span>}
        {timer && phase === 'question' && (
          isReadingBuffer ? (
            <span
              className="badge t-label-sm"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#F59E0B',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                fontWeight: 700,
              }}
            >
              📖 Reading
            </span>
          ) : (
            <CountdownTimer
              endsAt={timer.endsAt}
              durationSeconds={timer.durationSeconds}
              size={44}
            />
          )
        )}
      </div>
    </nav>
  );

  // ─── Session vanished under us ────────────────────────────────────────────
  // Checked before every other screen: when this is set, whatever the student
  // was looking at is stale, and a stale question screen invites them to keep
  // tapping answers that can never land.
  if (sessionLost) {
    return (
      <div className="menti-join-canvas">
        <main className="menti-join-center">
          <div style={{ fontSize: '3rem', lineHeight: 1 }} aria-hidden="true">📴</div>
          <div>
            <h1 className="menti-join-title">This session has closed</h1>
            <p className="menti-join-subtitle">{sessionLost}</p>
          </div>
          <p className="t-body-sm text-muted" style={{ maxWidth: '26rem', textAlign: 'center' }}>
            Your mentor may have restarted it. Check the screen at the front for a
            code — if it&rsquo;s a new one, join again below.
          </p>
          <button
            type="button"
            className="menti-btn-join"
            id="rejoin-btn"
            onClick={() => {
              setSessionLost('');
              setJoined(false);
              setPhase('lobby');
              setQuestion(null);
              setResults(null);
              setLeaderboard([]);
              setFinalData(null);
              resetForNewQuestion();
            }}
          >
            Join again
          </button>
        </main>

        {/* Deliberately promises nothing about the score. A restart clears the
            server's in-memory store, so "your answers were saved" would be a
            comforting lie in exactly the case that brings a student here. */}
        <footer className="menti-join-footer">
          Ask your mentor for the current code if this keeps happening.
        </footer>
      </div>
    );
  }

  // ─── Join screen ──────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="menti-join-canvas">
        <CollegeAuthModal
          isOpen={showAuthModal || !authUser}
          title="Polaris Student Portal"
          subtitle="Sign in with your official college email ID to participate in live quizzes"
          onSuccess={(user) => {
            setAuthUser(user);
            setShowAuthModal(false);
            if (!nameInput.trim()) {
              setNameInput(user.realName.split(' ')[0]);
            }
          }}
          onClose={authUser ? () => setShowAuthModal(false) : undefined}
          roleHint="student"
        />

        <StudentQuizHistoryModal
          isOpen={showHistoryModal}
          currentUser={authUser}
          onClose={() => setShowHistoryModal(false)}
        />

        <header className="menti-join-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '440px', margin: '0 auto', padding: '0.75rem 1rem' }}>
          {authUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="pm-auth-profile-badge">
                🎓 {authUser.realName}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn--sm"
                onClick={() => setShowHistoryModal(true)}
                title="View your past quiz scores"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
              >
                📜 My Quizzes
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
                Switch
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn--sm"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In with College ID
            </button>
          )}

          <a href="/dashboard" className="menti-join-pill-link">Host a session</a>
        </header>

        <main className="menti-join-center">
          <div className="menti-join-logo">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9H11V27H6V9Z" fill="currentColor" />
              <rect x="14" y="14" width="5" height="13" rx="1" fill="#F59E0B" />
              <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.65rem', letterSpacing: '-0.02em', color: 'inherit' }}>
              PollMeter
            </span>
          </div>

          <div>
            <h1 className="menti-join-title">Join Live Quiz</h1>
            <p className="menti-join-subtitle">
              {authUser ? `Welcome ${authUser.realName.split(' ')[0]}! Enter room code & nickname.` : 'Sign in with college ID to join.'}
            </p>
          </div>

          <form
            onSubmit={handleJoinSubmit}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}
            noValidate
          >
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  6-Digit Quiz Code
                </label>
                <input
                  id="join-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoFocus={!codeInput}
                  className="menti-join-input"
                  aria-label="6-digit session code"
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Screen Nickname
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600 }}>
                    Classmates see only this
                  </span>
                </div>
                <input
                  id="display-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Raja"
                  maxLength={24}
                  autoComplete="nickname"
                  className="menti-join-input"
                  style={{ height: '48px', fontSize: '1rem', letterSpacing: 'normal' }}
                  aria-label="Your screen nickname"
                />
                <span style={{ display: 'block', fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'left', lineHeight: 1.35 }}>
                  💡 Play as <strong>"{nameInput.trim() || 'Raja'}"</strong> during the quiz. Mentor receives your verified name <strong>({authUser?.realName || 'College ID'})</strong> in the official attendance sheet.
                </span>
              </div>
            </div>

            {joinError && (
              <div className="alert alert-error" style={{ width: '100%', borderRadius: '10px' }} role="alert">
                ⚠ {joinError}
              </div>
            )}

            <button
              type="submit"
              className="menti-btn-join"
              disabled={joining || !codeInput || !nameInput.trim()}
              id="join-btn"
            >
              {joining ? 'Connecting…' : 'Enter Lobby →'}
            </button>
          </form>
        </main>

        <footer className="menti-join-footer">
          🔒 Official Polaris Campus live learning portal.
        </footer>
      </div>
    );
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div className="card card--lg text-center stack stack-5">
            <div style={{ fontSize: '3.8rem', animation: 'bounce-in 0.5s var(--ease)' }}>{getAvatar(myName)}</div>
            <div className="stack stack-2">
              <h2 className="t-headline">You&rsquo;re in, {myName}!</h2>
              <p className="t-body-md text-secondary">
                Connected to session <strong style={{ color: 'var(--primary)' }}>{sessionCode}</strong>
              </p>
            </div>

            <div className="card stack stack-3" style={{ background: 'var(--surface-low)', padding: '1.25rem' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-md" style={{ color: 'var(--primary)' }}>
                  Waiting for your mentor to start…
                </span>
              </div>
              <p className="t-body-sm text-muted">
                {participantCount > 1
                  ? `${participantCount} people are in the room.`
                  : 'Keep this page open — it starts on its own.'}
              </p>
            </div>

            <button className="btn btn-ghost btn--sm" onClick={leaveSession}>Leave session</button>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Ended ────────────────────────────────────────────────────────────────
  if (phase === 'ended') {
    const isWinner = myEntry?.rank === 1;
    const isPodium = myEntry?.rank && myEntry.rank <= 3;

    return (
      <div className="menti-wrap-page">
        <div className="menti-wrap-container">
          {/* 1. Celebration Trophy & Title */}
          <div className="menti-wrap-hero">
            <div className="menti-wrap-trophy-wrap">
              <div className="menti-wrap-trophy-glow" />
              <div className="menti-wrap-trophy">🏆</div>
            </div>
            <h1 className="menti-wrap-title">That&rsquo;s a wrap!</h1>

            {/* 2. Personal Performance Highlight Card */}
            {myEntry && (
              <div
                className={`menti-wrap-highlight ${
                  isWinner ? 'menti-wrap-highlight--winner' : isPodium ? 'menti-wrap-highlight--podium' : ''
                }`}
              >
                <div className="menti-wrap-highlight-top">
                  <span
                    className={`menti-wrap-rank-badge ${
                      isWinner ? 'rank-1' : isPodium ? 'rank-podium' : 'rank-other'
                    }`}
                  >
                    {isWinner
                      ? '👑 1st Place'
                      : myEntry.rank === 2
                      ? '🥈 2nd Place'
                      : myEntry.rank === 3
                      ? '🥉 3rd Place'
                      : `Rank #${myEntry.rank}`}
                  </span>
                  <span className="menti-wrap-score-badge">
                    {myEntry.totalScore.toLocaleString()} pts
                  </span>
                </div>
                {myEntry.correctAnswers > 0 && (
                  <p className="menti-wrap-accuracy">
                    🎯 {myEntry.correctAnswers} of {finalData?.questions.length ?? questionCount} questions correct
                  </p>
                )}
              </div>
            )}

            {/* 3. Session meta */}
            {finalData && (
              <p className="menti-wrap-meta">
                {finalData.questions.length} question{finalData.questions.length === 1 ? '' : 's'} ·{' '}
                {leaderboard.length} participant{leaderboard.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {/* 4. Final Leaderboard Card with Podium (Top 10 for buttery smooth mobile performance) */}
          <div className="menti-wrap-card">
            <Leaderboard
              entries={leaderboard}
              myParticipantId={myParticipantId}
              limit={10}
              showPodium={leaderboard.length >= 2}
              title="🏁 Top 10 Standings"
              celebrateKey="final"
            />
          </div>

          {/* 5. Join Another Session Button */}
          <button
            className="menti-wrap-btn-primary"
            onClick={leaveSession}
            id="join-new-btn"
          >
            <span>🔄</span> Join another session
          </button>
        </div>
      </div>
    );
  }

  // ─── Leaderboard between questions ────────────────────────────────────────
  if (phase === 'leaderboard') {
    const hasScore = (myEntry?.totalScore ?? 0) > 0;
    const rank = hasScore ? myEntry?.rank : null;
    const message = hasScore
      ? rank === 1
        ? '🥇 You’re in 1st place!'
        : rank && rank <= 3
        ? '🥈 On the podium!'
        : rank && rank <= 5
        ? '🔥 Top 5 — keep going!'
        : '⚡ Still in it. Next one counts.'
      : '⚡ Warming up! Score on the next question.';

    return (
      <div className="page">
        {topNav}
        <div className="main-content">
          <div className="container--narrow stack stack-5" style={{ margin: '0 auto' }}>
            {/* Student's personal score and rank card */}
            <div
              className="card text-center stack stack-3"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                padding: '1.75rem 1.25rem',
                borderRadius: '20px',
              }}
            >
              <div style={{ fontSize: '2.5rem' }}>{hasScore && rank === 1 ? '👑' : hasScore && rank && rank <= 3 ? '🥈' : '⚡'}</div>
              <p className="t-headline" style={{ color: 'var(--primary)', margin: 0 }}>{message}</p>
              {myEntry && (
                <div className="stack stack-1">
                  <div className="row row-2" style={{ justifyContent: 'center', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {myEntry.totalScore.toLocaleString()}
                    </span>
                    <span className="t-label-md text-muted">pts</span>
                  </div>
                  {feedback?.score ? (
                    <span
                      className="badge badge-success"
                      style={{ alignSelf: 'center', fontSize: '0.85rem', fontWeight: 700 }}
                    >
                      +{feedback.score.toLocaleString()} this round
                    </span>
                  ) : null}
                </div>
              )}
              {rank && (
                <div className="row row-2" style={{ justifyContent: 'center', marginTop: '0.25rem' }}>
                  <span className="badge badge-neutral" style={{ fontSize: '0.85rem' }}>
                    Rank #{rank} of {leaderboard.length || 1}
                  </span>
                  {myEntry?.correctAnswers ? (
                    <span className="badge badge-neutral" style={{ fontSize: '0.85rem' }}>
                      ✓ {myEntry.correctAnswers} correct
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Student's Meme Roast/Praise Verdict Card on Leaderboard */}
            {feedback && feedback.graded && (() => {
              const isSpeedy = feedback.isCorrect && feedback.score >= 1300;
              const verdict = getVerdictQuote(feedback.isCorrect, isSpeedy, currentIndex);

              return (
                <div
                  className={`student-verdict-card ${feedback.isCorrect ? 'verdict-correct' : 'verdict-wrong'}`}
                  role="status"
                >
                  <div className="verdict-top-row">
                    <span className="verdict-emoji">{feedback.isCorrect ? (isSpeedy ? '⚡' : '🎉') : '🙃'}</span>
                    <span className="verdict-badge">{verdict.badge}</span>
                  </div>

                  <h3 className="verdict-quote">“{verdict.quote}”</h3>
                  <p className="verdict-subtext">{verdict.subtext}</p>

                  <div className="verdict-score-pill">
                    {feedback.isCorrect ? (
                      <>
                        <span className="verdict-score-num">+{feedback.score.toLocaleString()}</span>
                        <span className="verdict-score-label">pts {isSpeedy ? '🔥 Speed Bonus!' : 'earned'}</span>
                      </>
                    ) : (
                      <>
                        <span className="verdict-score-num" style={{ color: '#EF4444' }}>+0</span>
                        <span className="verdict-score-label">pts · Agle pe phodenge! 💪</span>
                      </>
                    )}
                  </div>

                  {!feedback.isCorrect && correctAnswer && (
                    <div className="verdict-correct-answer">
                      <span className="verdict-ca-label">Correct answer:</span>
                      <strong className="verdict-ca-text">{cleanText(correctAnswer)}</strong>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Poll verdict on leaderboard */}
            {feedback && !feedback.graded && (() => {
              const verdict = getVerdictQuote(true, false, currentIndex, true);
              return (
                <div className="student-verdict-card verdict-poll" role="status">
                  <div className="verdict-top-row">
                    <span className="verdict-emoji">🎙️</span>
                    <span className="verdict-badge">{verdict.badge}</span>
                  </div>
                  <h3 className="verdict-quote">“{verdict.quote}”</h3>
                  <p className="verdict-subtext">{verdict.subtext}</p>
                </div>
              );
            })()}

            {/* If missed the question */}
            {!feedback && myAnswer == null && (
              <div className="student-verdict-card verdict-missed" role="status">
                <div className="verdict-top-row">
                  <span className="verdict-emoji">⌛</span>
                  <span className="verdict-badge">⏰ Time Out</span>
                </div>
                <h3 className="verdict-quote">“So gaye the kya bhai?!”</h3>
                <p className="verdict-subtext">Agle sawal pe fingers alert rakhna! Comeback loading... 🚀</p>
              </div>
            )}

            {/* Live screen racing indicator banner */}
            <div
              className="row row-2"
              style={{
                justifyContent: 'center',
                padding: '0.65rem 1.15rem',
                background: 'rgba(15, 23, 42, 0.05)',
                borderRadius: '9999px',
                alignSelf: 'center',
                marginTop: '0.25rem',
              }}
            >
              <span className="spinner spinner--sm" style={{ borderTopColor: 'var(--menti-blue)' }} />
              <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                👀 Leaderboard racing on mentor&apos;s display · Next question soon
              </span>
            </div>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Question / results ───────────────────────────────────────────────────
  if (!question) {
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="stack stack-3 text-center">
          <div className="spinner" />
          <p className="text-muted">Waiting for your mentor…</p>
        </div>
      </div>
    );
  }

  const revealed = phase === 'results';
  const isMcq = question.type === 'mcq';

  return (
    <div className="page">
      {topNav}

      <div className="main-content">
        <div className="container--narrow stack stack-5" style={{ margin: '0 auto' }}>
          {tabSwitchWarning && phase === 'question' && (
            <div className="tab-switch-banner">
              <span>⚠️ Tab switch detected! Please keep your attention on the quiz.</span>
              <button
                className="btn btn-ghost btn--sm"
                onClick={() => setTabSwitchWarning(false)}
                style={{ color: '#92400E', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}

          <div
            className="card card--lg stack stack-5 quiz-anti-select"
            onContextMenu={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          >
            <div className="stack stack-2">
              <div className="row row-2" style={{ justifyContent: 'space-between' }}>
                <span className="badge badge-neutral t-label-sm">
                  Question {currentIndex + 1} of {questionCount}
                </span>
                {question.graded ? (
                  <span className="badge badge-primary t-label-sm">Scored</span>
                ) : (
                  <span className="badge badge-neutral t-label-sm">Poll · not scored</span>
                )}
              </div>
              <h2 className="t-headline" style={{ marginTop: '0.5rem' }}>{cleanText(question.text)}</h2>
            </div>

            {/* Reading Buffer State — options completely hidden during reading time */}
            {isReadingBuffer ? (
              <div className="menti-read-buffer-card">
                <div className="menti-read-buffer-badge">
                  <span className="menti-read-buffer-icon">📖</span>
                  <span>READING TIME</span>
                </div>
                <h3 className="menti-read-buffer-title">Read the question carefully</h3>
                <p className="menti-read-buffer-subtitle">
                  Options unlock in <strong className="menti-read-buffer-countdown">{readSecondsLeft}s</strong>
                </p>
                <div className="menti-read-buffer-track">
                  <div className="menti-read-buffer-fill" />
                </div>
                <span className="menti-read-buffer-hint">Options will appear here when the timer finishes. Get ready!</span>
              </div>
            ) : (
              <>
                {/* Answers */}
                {isMcq && (
                  <div className="stack stack-3" role="group" aria-label="Answer options">
                    {(question.options ?? []).map((opt, idx) => {
                      const mine = myAnswer === opt;
                      const isKey = revealed && correctAnswer === opt;
                      const color = OPTION_COLORS[idx % OPTION_COLORS.length];
                      const locked = !answersOpen;

                      return (
                        <button
                          key={opt}
                          className={`option-btn${mine ? ' selected is-mine' : ''}${
                            locked && !mine ? ' is-locked' : ''
                          }`}
                          onClick={() => submitValue(opt)}
                          disabled={locked}
                          aria-pressed={mine}
                          id={`option-${idx}`}
                          style={mine ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.28)' } : undefined}
                        >
                          <span className="option-letter">
                            {LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="option-text flex-1" style={{ textAlign: 'left', fontWeight: mine ? 700 : 500 }}>
                            {cleanText(opt)}
                          </span>
                          {submitting && mine ? (
                            <span className="spinner spinner--sm option-status" style={{ width: 16, height: 16 }} />
                          ) : isKey ? (
                            <span className="option-status" style={{ color: '#10B981', fontWeight: 800 }}>✓ Correct</span>
                          ) : mine ? (
                            <span className="option-status" style={{ color: '#F59E0B', fontWeight: 800 }}>✓</span>
                          ) : null}
                        </button>
                      );
                    })}

                    {answersOpen && (
                      <p className="text-secondary text-center" style={{ fontSize: '0.85rem' }}>
                        {question.graded
                          ? '⚡ Tap to lock it in — answering faster earns up to +500 bonus'
                          : 'Tap the option you agree with'}
                      </p>
                    )}
                  </div>
                )}

                {!isMcq && answersOpen && (
                  <div className="field">
                    <label className="field-label" htmlFor="open-response">Your answer</label>
                    <textarea
                      id="open-response"
                      value={openTextInput}
                      onChange={(e) => setOpenTextInput(e.target.value)}
                      placeholder="Type your answer…"
                      maxLength={300}
                      disabled={submitting}
                      rows={4}
                    />
                    <small style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                      {openTextInput.length}/300
                    </small>
                    <button
                      className="btn btn-primary btn--lg btn--full"
                      onClick={submitOpenText}
                      disabled={submitting || !openTextInput.trim()}
                      id="submit-response-btn"
                      style={{ marginTop: '0.75rem' }}
                    >
                      {submitting ? '⏳ Sending…' : 'Submit answer'}
                    </button>
                  </div>
                )}
              </>
            )}

            {submitError && <div className="alert alert-error" role="alert">⚠ {submitError}</div>}

            {/* Submitted, answers still open */}
            {myAnswer != null && !revealed && (
              <div className="locked-note">
                <span aria-hidden="true">🔒</span>
                <span>
                  Answer locked in{myAnswer && !isMcq ? `: “${cleanText(myAnswer)}”` : ''}.{' '}
                  {question.graded
                    ? 'Results appear when the timer ends.'
                    : 'Watch the screen for the room’s answers.'}
                </span>
              </div>
            )}

            {/* Nothing submitted and question has ended / revealed */}
            {revealed && myAnswer == null && (
              <div className="student-verdict-card verdict-missed" role="status">
                <div className="verdict-top-row">
                  <span className="verdict-emoji">⌛</span>
                  <span className="verdict-badge">⏰ Time Out</span>
                </div>
                <h3 className="verdict-quote">“So gaye the kya bhai?!”</h3>
                <p className="verdict-subtext">Agle sawal pe fingers alert rakhna! Comeback loading... 🚀</p>
              </div>
            )}

            {/* Graded result, after reveal */}
            {revealed && feedback && feedback.graded && (() => {
              const isSpeedy = feedback.isCorrect && feedback.score >= 1300;
              const verdict = getVerdictQuote(feedback.isCorrect, isSpeedy, currentIndex);

              return (
                <div
                  className={`student-verdict-card ${feedback.isCorrect ? 'verdict-correct' : 'verdict-wrong'}`}
                  role="status"
                >
                  <div className="verdict-top-row">
                    <span className="verdict-emoji">{feedback.isCorrect ? (isSpeedy ? '⚡' : '🎉') : '🙃'}</span>
                    <span className="verdict-badge">{verdict.badge}</span>
                  </div>

                  <h3 className="verdict-quote">“{verdict.quote}”</h3>
                  <p className="verdict-subtext">{verdict.subtext}</p>

                  <div className="verdict-score-pill">
                    {feedback.isCorrect ? (
                      <>
                        <span className="verdict-score-num">+{feedback.score.toLocaleString()}</span>
                        <span className="verdict-score-label">pts {isSpeedy ? '🔥 Speed Bonus!' : 'earned'}</span>
                      </>
                    ) : (
                      <>
                        <span className="verdict-score-num" style={{ color: '#EF4444' }}>+0</span>
                        <span className="verdict-score-label">pts · Agle pe phodenge! 💪</span>
                      </>
                    )}
                  </div>

                  {!feedback.isCorrect && correctAnswer && (
                    <div className="verdict-correct-answer">
                      <span className="verdict-ca-label">Correct answer:</span>
                      <strong className="verdict-ca-text">{cleanText(correctAnswer)}</strong>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Poll / open-text result — no right answer, so no single verdict */}
            {revealed && feedback && !feedback.graded && (() => {
              const verdict = getVerdictQuote(true, false, currentIndex, true);
              return (
                <div className="student-verdict-card verdict-poll" role="status">
                  <div className="verdict-top-row">
                    <span className="verdict-emoji">🎙️</span>
                    <span className="verdict-badge">{verdict.badge}</span>
                  </div>
                  <h3 className="verdict-quote">“{verdict.quote}”</h3>
                  <p className="verdict-subtext">{verdict.subtext}</p>
                </div>
              );
            })()}
          </div>

          {/* Distribution — withheld by the server while a graded question is open */}
          {results != null && (
            <div className="card card--lg stack stack-4">
              <div className="row row-2" style={{ justifyContent: 'space-between' }}>
                <p className="t-title" style={{ fontSize: '1.05rem' }}>
                  {revealed ? 'Results' : 'Live answers'}
                </p>
                <span className="t-label-sm text-muted">
                  {answeredCount} of {participantCount || '—'}
                </span>
              </div>
              <hr className="divider" />
              {isMcq ? (
                <LiveBarChart
                  aggregated={results as McqAggregated}
                  correctAnswer={revealed ? correctAnswer : undefined}
                />
              ) : (
                <TextResponseList responses={results as TextAggregated} />
              )}
            </div>
          )}

          {/* Graded + open: show progress only, never the distribution */}
          {results == null && question.graded && (
            <div className="card text-center" style={{ padding: '1rem', background: 'var(--surface-low)' }}>
              <span className="t-label-sm text-secondary">
                {answeredCount} of {participantCount || '—'} answered · results hidden until the timer ends
              </span>
            </div>
          )}
        </div>
      </div>

      {reactionsDock}

      {/* Laptop / Desktop Fullscreen Anti-Cheat Overlay */}
      {isDesktop && joined && phase === 'question' && !isStudentFullscreen && (
        <div className="student-fs-guard-overlay">
          <div className="student-fs-guard-card">
            <span className="student-fs-guard-icon">🛡️</span>
            <h2 className="student-fs-guard-title">Exam Mode Required</h2>
            <p className="student-fs-guard-desc">
              To ensure fair competition and prevent browser toolbars from assisting, laptop participants must remain in fullscreen mode.
            </p>
            <button
              className="btn btn-primary btn--lg"
              onClick={enterStudentFullscreen}
              id="student-enter-fs-btn"
              style={{ fontWeight: 800, padding: '0.75rem 2rem', borderRadius: '12px' }}
            >
              ⛶ Enter Fullscreen to Answer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
