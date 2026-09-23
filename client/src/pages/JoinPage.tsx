import { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';
import {
  PublicQuestion,
  SessionPhase,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  SessionStatePayload,
  QuestionStartedPayload,
  PhaseChangedPayload,
  ResponseCountPayload,
  ResultsRevealedPayload,
  SessionEndedPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  ResponseAcceptedPayload,
  TimerUpdatedPayload,
} from '../types';
import CountdownTimer from '../components/CountdownTimer';
import LiveBarChart from '../components/LiveBarChart';
import TextResponseList from '../components/TextResponseList';
import Leaderboard from '../components/Leaderboard';

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
const AVATARS = ['🚀', '⚡', '🌟', '🎮', '🎯', '🦁', '🦊', '🐯', '🏀', '🦄', '🎓'];

function getAvatar(name: string): string {
  if (!name) return '🎓';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATARS[Math.abs(hash) % AVATARS.length] ?? '🎓';
}

export default function JoinPage() {
  // Join form
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

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
  const [timer, setTimer] = useState<{ endsAt: number; durationSeconds: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);
  const [connected, setConnected] = useState(socket.connected);

  // My answer + result for the question on screen
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ResponseAcceptedPayload | null>(null);
  const [openTextInput, setOpenTextInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const identity = useRef<StoredSession | null>(null);
  // Read inside socket callbacks without making them a dependency — keying the
  // listener effect on `nameInput` re-registered every handler on each keystroke.
  const pendingName = useRef('');
  const joinedRef = useRef(false);

  const persist = useCallback((next: StoredSession) => {
    identity.current = next;
    joinedRef.current = true;
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }, []);

  const doJoin = useCallback((code: string, name: string, stored?: StoredSession | null) => {
    pendingName.current = name;
    setJoining(true);
    setJoinError('');
    if (!socket.connected) socket.connect();
    socket.emit('join_session', {
      code: code.trim(),
      name: name.trim(),
      // Both halves, or the server treats this as a fresh student.
      participantId: stored?.code === code.trim() ? stored.participantId : undefined,
      rejoinToken: stored?.code === code.trim() ? stored.rejoinToken : undefined,
    });
  }, []);

  /** Clears everything tied to the question currently on screen. */
  function resetForNewQuestion() {
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
        setTimer({ endsAt: p.timerEndsAt, durationSeconds: p.question.timeLimitSeconds });
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
      setTimer({ endsAt: p.timerEndsAt, durationSeconds: p.question.timeLimitSeconds });
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
      setSubmitting(false);
      setMyAnswer(p.value);
      setSubmitError('');
    }

    function onResponseFeedback(p: ResponseAcceptedPayload & { correctAnswer?: string }) {
      setSubmitting(false);
      setFeedback(p);
      setMyAnswer(p.value);
      if (p.correctAnswer) setCorrectAnswer(p.correctAnswer);
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

    function onError(p: { message: string }) {
      if (!joinedRef.current) {
        setJoinError(p.message);
        setJoining(false);
        // A stale identity from a finished session must not block a fresh join.
        localStorage.removeItem(LS_KEY);
        identity.current = null;
      } else {
        setSubmitError(p.message);
      }
      setSubmitting(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session_state', onSessionState);
    socket.on('question_started', onQuestionStarted);
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
      socket.off('disconnect', onDisconnect);
      socket.off('session_state', onSessionState);
      socket.off('question_started', onQuestionStarted);
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
    joinedRef.current = true;
    doJoin(stored.code, stored.name, stored);
  }, [doJoin]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    const name = nameInput.trim();

    if (!/^\d{6}$/.test(code)) {
      setJoinError('Please enter the 6-digit code from the screen.');
      return;
    }
    if (!name) {
      setJoinError('Please enter your name so your mentor can see your score.');
      return;
    }
    joinedRef.current = true;
    doJoin(code, name, identity.current);
  }

  const answersOpen = phase === 'question' && myAnswer == null;

  function submitValue(value: string) {
    if (!question || !identity.current) return;
    if (!answersOpen || submitting) return;

    setMyAnswer(value);        // optimistic, so the tap feels instant
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
    <div className="reactions-dock" role="toolbar" aria-label="Classroom reactions">
      {['👍', '❤️', '👏', '🔥', '💡'].map((emoji) => (
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
  );

  const topNav = (
    <nav className="nav">
      <span className="nav-logo">
        <svg width="24" height="24" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 9H11V27H6V9Z" fill="#191C21" />
          <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
          <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
        </svg>
        <span style={{ fontWeight: 800, color: '#191C21' }}>PollMeter</span>
      </span>
      <div className="row row-2">
        {!connected && <span className="badge badge-warning t-label-sm">Reconnecting…</span>}
        {connected && <span className="badge badge-live">Live</span>}
        {questionCount > 0 && <span className="chip">Q{currentIndex + 1}/{questionCount}</span>}
        {timer && phase === 'question' && (
          <CountdownTimer
            endsAt={timer.endsAt}
            durationSeconds={timer.durationSeconds}
            size={44}
          />
        )}
      </div>
    </nav>
  );

  // ─── Join screen ──────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="menti-join-canvas">
        <header className="menti-join-topbar">
          <a href="/host" className="menti-join-pill-link">Host a session</a>
        </header>

        <main className="menti-join-center">
          <div className="menti-join-logo">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9H11V27H6V9Z" fill="#191C21" />
              <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
              <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.65rem', letterSpacing: '-0.02em', color: '#191C21' }}>
              PollMeter
            </span>
          </div>

          <div>
            <h1 className="menti-join-title">Enter the code to join</h1>
            <p className="menti-join-subtitle">It&rsquo;s on the screen in front of you</p>
          </div>

          <form
            onSubmit={handleJoinSubmit}
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}
            noValidate
          >
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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

              <input
                id="display-name"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name"
                maxLength={24}
                autoComplete="given-name"
                className="menti-join-input"
                style={{ height: '48px', fontSize: '1rem', letterSpacing: 'normal' }}
                aria-label="Your display name"
              />
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
              {joining ? 'Connecting…' : 'Join'}
            </button>
          </form>
        </main>

        <footer className="menti-join-footer">
          Your name is shown on the classroom leaderboard.
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
                Connected to session <strong style={{ color: 'var(--menti-blue)' }}>{sessionCode}</strong>
              </p>
            </div>

            <div className="card stack stack-3" style={{ background: 'var(--surface-low)', padding: '1.25rem' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-md" style={{ color: 'var(--menti-blue)' }}>
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
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div className="stack stack-6">
            <div className="text-center stack stack-3">
              <div style={{ fontSize: '3.5rem', animation: 'bounce-in 0.5s var(--ease)' }}>🏆</div>
              <h1 className="t-headline">That&rsquo;s a wrap!</h1>
              {myEntry && (
                <p className="t-body-lg" style={{ color: 'var(--menti-blue)', fontWeight: 700 }}>
                  You finished #{myEntry.rank} with {myEntry.totalScore.toLocaleString()} points
                  {myEntry.correctAnswers > 0 && ` · ${myEntry.correctAnswers} correct`}
                </p>
              )}
              {finalData && (
                <p className="t-body-md text-secondary">
                  {finalData.questions.length} question{finalData.questions.length === 1 ? '' : 's'} ·{' '}
                  {leaderboard.length} participant{leaderboard.length === 1 ? '' : 's'}
                </p>
              )}
            </div>

            <div className="card card--lg">
              <Leaderboard
                entries={leaderboard}
                myParticipantId={myParticipantId}
                showAll
                title="🏁 Final results"
                celebrateKey="final"
              />
            </div>

            <button className="btn btn-primary btn--lg btn--full" onClick={leaveSession} id="join-new-btn">
              Join another session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Leaderboard between questions ────────────────────────────────────────
  if (phase === 'leaderboard') {
    const rank = myEntry?.rank;
    const message =
      rank === 1
        ? '🥇 You’re in 1st place!'
        : rank && rank <= 3
        ? '🥈 On the podium!'
        : rank && rank <= 5
        ? '🔥 Top 5 — keep going!'
        : '⚡ Still in it. Next one counts.';

    return (
      <div className="page">
        {topNav}
        <div className="main-content">
          <div className="container--narrow stack stack-6" style={{ margin: '0 auto' }}>
            <div
              className="card text-center stack stack-2"
              style={{ background: 'var(--surface-mid)', borderColor: 'rgba(31,105,255,0.2)' }}
            >
              <p className="t-headline" style={{ color: 'var(--menti-blue)' }}>{message}</p>
              {myEntry && (
                <p className="t-body-md text-secondary">
                  Your score: <strong>{myEntry.totalScore.toLocaleString()} pts</strong>
                  {myEntry.correctAnswers > 0 && ` · ${myEntry.correctAnswers} correct`}
                </p>
              )}
            </div>

            <div className="card card--lg">
              <Leaderboard
                entries={leaderboard}
                myParticipantId={myParticipantId}
                limit={10}
                title="🏆 Standings"
                celebrateKey={currentIndex}
              />
            </div>

            <div className="card text-center" style={{ padding: '1rem', background: 'var(--surface-low)' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-sm text-secondary">Waiting for the next question…</span>
              </div>
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
          <div className="card card--lg stack stack-5">
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
              <h2 className="t-headline" style={{ marginTop: '0.5rem' }}>{question.text}</h2>
            </div>

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
                      style={mine ? { borderColor: color, boxShadow: `0 0 0 2px ${color}33` } : undefined}
                    >
                      <span className="option-letter" style={{ backgroundColor: color, color: '#fff', fontWeight: 800 }}>
                        {LETTERS[idx] ?? idx + 1}
                      </span>
                      <span className="flex-1" style={{ textAlign: 'left', fontWeight: mine ? 700 : 500 }}>
                        {opt}
                      </span>
                      {submitting && mine ? (
                        <span className="spinner spinner--sm" style={{ width: 16, height: 16 }} />
                      ) : isKey ? (
                        <span style={{ color: '#0ca30c', fontWeight: 800 }}>✓ Correct</span>
                      ) : mine ? (
                        <span style={{ color, fontWeight: 800 }}>✓</span>
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

            {submitError && <div className="alert alert-error" role="alert">⚠ {submitError}</div>}

            {/* Submitted, answers still open */}
            {myAnswer != null && !revealed && (
              <div className="locked-note">
                <span aria-hidden="true">🔒</span>
                <span>
                  Answer locked in{myAnswer && !isMcq ? `: “${myAnswer}”` : ''}.{' '}
                  {question.graded
                    ? 'Results appear when the timer ends.'
                    : 'Watch the screen for the room’s answers.'}
                </span>
              </div>
            )}

            {/* Nothing submitted and answers are closed */}
            {myAnswer == null && !answersOpen && (
              <div className="locked-note">
                <span aria-hidden="true">⌛</span>
                <span>Answers are closed for this one. You can still score on the next question.</span>
              </div>
            )}

            {/* Graded result, after reveal */}
            {revealed && feedback && feedback.graded && (
              <div
                className={`alert ${feedback.isCorrect ? 'alert-success' : 'alert-error'} stack stack-2`}
                style={{ padding: '1.25rem', textAlign: 'center' }}
                role="status"
              >
                <div style={{ fontSize: '2.5rem' }}>{feedback.isCorrect ? '🎉' : '❌'}</div>
                <p className="t-title">
                  {feedback.isCorrect
                    ? `Correct! +${feedback.score.toLocaleString()} pts`
                    : 'Not this time · +0 pts'}
                </p>
                {!feedback.isCorrect && correctAnswer && (
                  <p className="t-body-sm text-secondary">
                    Correct answer: <strong>{correctAnswer}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Poll / open-text result — no right answer, so no verdict */}
            {revealed && feedback && !feedback.graded && (
              <div className="alert alert-success" style={{ justifyContent: 'center' }} role="status">
                ✓ Your answer was counted
              </div>
            )}
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
    </div>
  );
}
