import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import {
  Question,
  SessionStatus,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  SessionStatePayload,
  QuestionChangedPayload,
  ResultsUpdatedPayload,
  SessionEndedPayload,
  LeaderboardPayload,
  LeaderboardEntry,
  ResponseAcceptedPayload,
  TimerStartedPayload,
} from '../types';
import CountdownTimer from '../components/CountdownTimer';
import LiveBarChart from '../components/LiveBarChart';
import TextResponseList from '../components/TextResponseList';
import Leaderboard from '../components/Leaderboard';

const LS_KEY = 'pollsync_participant';

interface StoredSession {
  code: string;
  participantId: string;
  name: string;
}

type AudienceStep =
  | 'join'        // Enter code + name
  | 'waiting'     // Lobby, waiting for host to start
  | 'question'    // Answering current question
  | 'answered'    // Submitted, waiting for timer / leaderboard
  | 'leaderboard' // Leaderboard shown between questions
  | 'ended';      // Session completed

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

  // Session state
  const [step, setStep] = useState<AudienceStep>('join');
  const [sessionCode, setSessionCode] = useState('');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('lobby');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [liveResults, setLiveResults] = useState<AggregatedResult | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [openTextInput, setOpenTextInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [finalData, setFinalData] = useState<SessionEndedPayload | null>(null);

  // Timer state
  const [timer, setTimer] = useState<{ startedAt: number; durationSeconds: number } | null>(null);
  const [isTimerExpired, setIsTimerExpired] = useState(false);

  // Leaderboard & Feedback
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    score: number;
    correctAnswer?: string;
  } | null>(null);

  // Participant info (persisted)
  const participantRef = useRef<StoredSession | null>(null);

  // ─── Auto-read URL ?code= parameter ───────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && /^\d{6}$/.test(codeParam)) {
      setCodeInput(codeParam);
    }
  }, []);

  // ─── Attempt auto-rejoin on mount ─────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const stored: StoredSession = JSON.parse(raw);
        if (stored.code && stored.participantId && stored.name) {
          participantRef.current = stored;
          // If URL had a different code, prioritize that
          const params = new URLSearchParams(window.location.search);
          const codeParam = params.get('code');
          if (!codeParam || codeParam === stored.code) {
            setCodeInput(stored.code);
            setNameInput(stored.name);
            doJoin(stored.code, stored.name, stored.participantId);
          }
        }
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Socket event listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    function onSessionState(payload: SessionStatePayload & { alreadyAnswered?: boolean }) {
      const stored: StoredSession = {
        code: payload.code,
        participantId: payload.participantId,
        name: nameInput || participantRef.current?.name || '',
      };
      localStorage.setItem(LS_KEY, JSON.stringify(stored));
      participantRef.current = stored;

      setSessionCode(payload.code);
      const qCount = payload.questions?.length ?? payload.questionCount ?? 0;
      setTotalQuestions(qCount);
      setCurrentIndex(payload.currentIndex);
      setLeaderboard(payload.leaderboard ?? []);

      if (payload.status === 'lobby' || payload.phase === 'lobby') {
        setSessionStatus('lobby');
        setStep('waiting');
        setJoining(false);
        return;
      }

      if (payload.status === 'ended' || payload.phase === 'ended') {
        setStep('ended');
        setJoining(false);
        return;
      }

      // Active
      setSessionStatus('active');
      const q = (payload.questions && payload.questions[payload.currentIndex]) || (payload.question as unknown as Question | null);
      if (q) {
        setCurrentQuestion(q);
        if (payload.currentResults || payload.results) {
          setLiveResults(payload.currentResults || payload.results);
        }
        if (payload.timerStartedAt) {
          setTimer({ startedAt: payload.timerStartedAt, durationSeconds: q.timeLimitSeconds });
        }
        setStep(payload.alreadyAnswered ? 'answered' : 'question');
      }
      setJoining(false);
    }

    function onQuestionChanged(payload: QuestionChangedPayload) {
      setCurrentQuestion(payload.question);
      setCurrentIndex(payload.index);
      setLiveResults(null);
      setSelectedOption(null);
      setOpenTextInput('');
      setSubmitError('');
      setFeedback(null);
      setIsTimerExpired(false);
      setTimer({
        startedAt: payload.timerStartedAt,
        durationSeconds: payload.question.timeLimitSeconds,
      });
      setStep('question');
    }

    function onTimerStarted(payload: TimerStartedPayload) {
      setIsTimerExpired(false);
      setTimer({
        startedAt: payload.startedAt,
        durationSeconds: payload.durationSeconds,
      });
    }

    function onResultsUpdated(payload: ResultsUpdatedPayload) {
      setLiveResults(payload.aggregated);
      setIsTimerExpired(true);
    }

    function onResultsRevealed(payload: { correctAnswer?: string; aggregated?: AggregatedResult }) {
      setIsTimerExpired(true);
      if (payload.aggregated) setLiveResults(payload.aggregated);
      if (payload.correctAnswer) {
        setFeedback((prev) => (prev ? { ...prev, correctAnswer: payload.correctAnswer } : prev));
      }
    }

    function onResponseAccepted(payload: ResponseAcceptedPayload) {
      setSubmitting(false);
      setFeedback({
        isCorrect: payload.isCorrect,
        score: payload.score,
        correctAnswer: payload.correctAnswer,
      });
      setStep('answered');
    }

    function onLeaderboardUpdated(payload: LeaderboardPayload) {
      setIsTimerExpired(true);
      setLeaderboard(payload.leaderboard);
      setStep('leaderboard');
    }

    function onSessionEnded(payload: SessionEndedPayload) {
      setIsTimerExpired(true);
      setFinalData(payload);
      setLeaderboard(payload.leaderboard);
      setStep('ended');
      localStorage.removeItem(LS_KEY);
    }

    function onError(payload: { message: string }) {
      setJoinError(payload.message);
      setSubmitError(payload.message);
      setJoining(false);
      setSubmitting(false);
    }

    socket.on('session_state', onSessionState);
    socket.on('question_changed', onQuestionChanged);
    socket.on('timer_started', onTimerStarted);
    socket.on('results_updated', onResultsUpdated);
    socket.on('results_revealed', onResultsRevealed);
    socket.on('response_accepted', onResponseAccepted);
    socket.on('leaderboard_updated', onLeaderboardUpdated);
    socket.on('session_ended', onSessionEnded);
    socket.on('error', onError);

    return () => {
      socket.off('session_state', onSessionState);
      socket.off('question_changed', onQuestionChanged);
      socket.off('timer_started', onTimerStarted);
      socket.off('results_updated', onResultsUpdated);
      socket.off('results_revealed', onResultsRevealed);
      socket.off('response_accepted', onResponseAccepted);
      socket.off('leaderboard_updated', onLeaderboardUpdated);
      socket.off('session_ended', onSessionEnded);
      socket.off('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameInput]);

  // ─── Join / Rejoin ────────────────────────────────────────────────────────
  function doJoin(code: string, name: string, existingId?: string) {
    if (!socket.connected) socket.connect();
    setJoining(true);
    setJoinError('');
    socket.emit('join_session', {
      code: code.trim(),
      name: name.trim(),
      participantId: existingId,
    });
  }

  function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    const name = nameInput.trim();

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      setJoinError('Please enter the 6-digit join code.');
      return;
    }
    if (!name) {
      setJoinError('Please enter your display name.');
      return;
    }
    doJoin(code, name);
  }

  // ─── Instant submit for MCQ on click (Rule 9) ───────────────────────────
  function submitOption(opt: string) {
    if (submitting || !currentQuestion || !participantRef.current) return;
    setSelectedOption(opt);
    setSubmitError('');
    setSubmitting(true);
    socket.emit('submit_response', {
      code: participantRef.current.code,
      questionId: currentQuestion.id,
      value: opt,
    });
  }

  // ─── Submit response for open_text ────────────────────────────────────────
  function submitResponse() {
    if (!currentQuestion || !participantRef.current) return;
    const value =
      currentQuestion.type === 'mcq' ? selectedOption ?? '' : openTextInput.trim();

    if (!value) {
      setSubmitError(
        currentQuestion.type === 'mcq'
          ? 'Please select an option.'
          : 'Please type your answer.'
      );
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    socket.emit('submit_response', {
      code: participantRef.current.code,
      questionId: currentQuestion.id,
      value,
    });
  }

  function sendReaction(emoji: string) {
    const c = sessionCode || participantRef.current?.code;
    if (c) {
      socket.emit('send_reaction', { code: c, emoji });
    }
  }

  // Find my personal entry in leaderboard
  const myParticipantId = participantRef.current?.participantId;
  const myEntry = leaderboard.find((e) => e.participantId === myParticipantId);

  const reactionsDock = (
    <div className="reactions-dock" role="toolbar" aria-label="Classroom reactions">
      {['👍', '❤️', '👏', '🔥', '💡'].map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-btn"
          onClick={() => sendReaction(emoji)}
          title={`Send ${emoji} to screen`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  // ─── Step 1: Join Screen ──────────────────────────────────────────────────
  if (step === 'join') {
    return (
      <div className="menti-join-canvas">
        <header className="menti-join-topbar">
          <a href="/host" className="menti-join-pill-link">
            Host a session
          </a>
        </header>

        <main className="menti-join-center">
          <div className="menti-join-logo">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9H11V27H6V9Z" fill="#191C21" />
              <path d="M14 15H19V27H14V27Z" fill="#F43F5E" />
              <rect x="14" y="14" width="5" height="13" rx="1" fill="#F43F5E" />
              <rect x="22" y="7" width="5" height="20" rx="1" fill="#3B82F6" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.65rem', letterSpacing: '-0.02em', color: '#191C21' }}>PollMeter</span>
          </div>

          <div>
            <h1 className="menti-join-title">Enter the code to join</h1>
            <p className="menti-join-subtitle">It's on the screen in front of you</p>
          </div>

          <form onSubmit={handleJoinSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }} noValidate>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <input
                id="join-code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="1234 5678"
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
                maxLength={32}
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
              disabled={joining || !codeInput || !nameInput}
              id="join-btn"
            >
              {joining ? 'Connecting…' : 'Join'}
            </button>
          </form>
        </main>

        <footer className="menti-join-footer">
          By using PollMeter you accept our <a href="#" onClick={(e) => e.preventDefault()}>terms of use</a> and <a href="#" onClick={(e) => e.preventDefault()}>policies</a>
        </footer>
      </div>
    );
  }

  // ─── Step 2: Lobby / Waiting Screen ───────────────────────────────────────
  if (step === 'waiting') {
    const name = participantRef.current?.name || nameInput;
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <div className="card card--lg text-center stack stack-5">
            <div style={{ fontSize: '3.8rem', animation: 'bounce-in 0.5s var(--ease)' }}>
              {getAvatar(name)}
            </div>
            <div className="stack stack-2">
              <h2 className="t-headline">You're In, {name}!</h2>
              <p className="t-body-md text-secondary">
                Connected to session <strong style={{ color: 'var(--primary)' }}>{sessionCode}</strong>
              </p>
            </div>

            <div className="card stack stack-3" style={{ background: 'var(--surface-low)', padding: '1.25rem' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-md" style={{ color: 'var(--primary)' }}>
                  Waiting for host to start…
                </span>
              </div>
              <p className="t-body-sm text-muted">
                ⚡ Tip: Correct answers submitted faster earn up to +500 extra speed bonus!
              </p>
            </div>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Step 3: Question Answering Screen ─────────────────────────────────────
  if (step === 'question' && currentQuestion) {
    return (
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
          <div className="row row-2">
            <span className="badge badge-live">Live</span>
            <span className="chip">Q{currentIndex + 1}/{totalQuestions}</span>
            {timer && (
              <CountdownTimer
                durationSeconds={timer.durationSeconds}
                startedAt={timer.startedAt}
                size={44}
              />
            )}
          </div>
        </nav>

        <div className="main-content">
          <div className="container--narrow stack stack-6" style={{ margin: '0 auto' }}>
            <div className="card card--lg stack stack-5">
              <div className="stack stack-2">
                <div className="row row-2" style={{ justifyContent: 'space-between' }}>
                  <span className="badge badge-neutral t-label-sm">
                    Question {currentIndex + 1} of {totalQuestions}
                  </span>
                  <span className="badge badge-warning t-label-sm">
                    ⏱ {currentQuestion.timeLimitSeconds}s Limit
                  </span>
                </div>
                <h2 className="t-headline" style={{ marginTop: '0.5rem', color: 'var(--text-primary)' }}>
                  {currentQuestion.text}
                </h2>
              </div>

              <div className="card card--sm" style={{ background: 'var(--surface-low)', padding: '0.75rem 1rem' }}>
                <p className="t-body-sm text-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>⚡</span> <strong>Speed Bonus:</strong> Answer quickly to maximize your points!
                </p>
              </div>

              <hr className="divider" />

              {/* Multiple Choice Options - Auto submit on click (Rule 9) */}
              {currentQuestion.type === 'mcq' && (
                <div className="stack stack-3" role="radiogroup" aria-label="Answer options">
                  {(currentQuestion.options ?? []).map((opt, idx) => {
                    const isSelected = selectedOption === opt;
                    const optColor = OPTION_COLORS[idx % OPTION_COLORS.length];
                    return (
                      <button
                        key={opt}
                        className={`option-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => submitOption(opt)}
                        disabled={submitting}
                        role="radio"
                        aria-checked={isSelected}
                        id={`option-${idx}`}
                        style={isSelected ? { borderColor: optColor, boxShadow: `0 0 0 2px ${optColor}33` } : {}}
                      >
                        <span
                          className="option-letter"
                          style={{ backgroundColor: optColor, color: '#FFFFFF', fontWeight: 800 }}
                        >
                          {LETTERS[idx] ?? idx + 1}
                        </span>
                        <span className="flex-1" style={{ textAlign: 'left', fontWeight: isSelected ? 700 : 500 }}>
                          {opt}
                        </span>
                        {submitting && isSelected ? (
                          <span className="spinner spinner--sm" style={{ width: '16px', height: '16px' }} />
                        ) : isSelected ? (
                          <span style={{ color: optColor, fontWeight: 800 }}>✓</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <p className="text-secondary text-center" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    ⚡ Tap an option to submit instantly
                  </p>
                </div>
              )}

              {/* Open Text Question */}
              {currentQuestion.type === 'open_text' && (
                <div className="field">
                  <label className="field-label" htmlFor="open-response">Your Response</label>
                  <textarea
                    id="open-response"
                    value={openTextInput}
                    onChange={(e) => setOpenTextInput(e.target.value)}
                    placeholder="Type your response here…"
                    maxLength={300}
                    disabled={submitting}
                    rows={4}
                  />
                  <small style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {openTextInput.length}/300
                  </small>
                </div>
              )}

              {submitError && (
                <div className="alert alert-error" role="alert">⚠ {submitError}</div>
              )}

              {currentQuestion.type === 'open_text' && (
                <button
                  className="btn btn-primary btn--lg btn--full"
                  onClick={submitResponse}
                  disabled={submitting || !openTextInput.trim()}
                  id="submit-response-btn"
                >
                  {submitting ? '⏳ Submitting…' : '✓ Submit Answer'}
                </button>
              )}
            </div>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Step 4: Answered / Feedback Screen (Rule 9) ──────────────────────────
  if (step === 'answered' && currentQuestion) {
    const showRevealedFeedback = isTimerExpired || feedback?.correctAnswer;

    return (
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
          <div className="row row-2">
            <span className="badge badge-live">Live</span>
            <span className="chip">Q{currentIndex + 1}/{totalQuestions}</span>
            {timer && (
              <CountdownTimer
                durationSeconds={timer.durationSeconds}
                startedAt={timer.startedAt}
                size={44}
                onExpired={() => setIsTimerExpired(true)}
              />
            )}
          </div>
        </nav>

        <div className="main-content">
          <div className="container--narrow stack stack-6" style={{ margin: '0 auto' }}>
            {/* Feedback / Locked Card */}
            {showRevealedFeedback ? (
              feedback ? (
                feedback.isCorrect ? (
                  <div className="alert alert-success stack stack-2" style={{ padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem' }}>🎉</div>
                    <p className="t-title" style={{ color: 'var(--secondary-dark)' }}>
                      Correct Answer! +{feedback.score} pts
                    </p>
                    <p className="t-body-sm text-secondary">
                      Great speed! Your points have been added to the leaderboard.
                    </p>
                  </div>
                ) : (
                  <div className="alert alert-error stack stack-2" style={{ padding: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem' }}>❌</div>
                    <p className="t-title" style={{ color: '#BA1A1A' }}>
                      Not quite! +0 pts
                    </p>
                    {feedback.correctAnswer && (
                      <p className="t-body-sm text-secondary">
                        Correct answer: <strong>{feedback.correctAnswer}</strong>
                      </p>
                    )}
                  </div>
                )
              ) : (
                <div className="alert alert-success" style={{ justifyContent: 'center' }}>
                  ✓ Response submitted!
                </div>
              )
            ) : (
              <div className="alert alert-info stack stack-2" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem' }}>🔒</div>
                <p className="t-title" style={{ color: 'var(--menti-blue)' }}>
                  Answer Submitted!
                </p>
                <p className="t-body-sm text-secondary">
                  {selectedOption ? (
                    <>You picked: <strong>{selectedOption}</strong>.<br /></>
                  ) : null}
                  Correctness & points will be revealed as soon as the timer ends.
                </p>
              </div>
            )}

            {/* Live Chart Preview */}
            <div className="card card--lg stack stack-4">
              <div className="row row-2" style={{ justifyContent: 'space-between' }}>
                <p className="t-title" style={{ fontSize: '1.1rem' }}>{currentQuestion.text}</p>
              </div>
              <hr className="divider" />

              {currentQuestion.type === 'mcq' && liveResults && (
                <LiveBarChart
                  aggregated={liveResults as McqAggregated}
                  correctAnswer={showRevealedFeedback ? feedback?.correctAnswer : undefined}
                />
              )}

              {currentQuestion.type === 'open_text' && liveResults && (
                <TextResponseList responses={liveResults as TextAggregated} />
              )}
            </div>

            {/* Next question waiting indicator */}
            <div className="card text-center stack stack-2" style={{ padding: '1.25rem', background: 'var(--surface-low)' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-md" style={{ color: 'var(--primary)' }}>
                  Waiting for next question & leaderboard…
                </span>
              </div>
            </div>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Step 5: Leaderboard Screen ───────────────────────────────────────────
  if (step === 'leaderboard') {
    const myRank = myEntry?.rank;
    const motivational =
      myRank === 1
        ? '🥇 You are in 1st place! Outstanding!'
        : myRank && myRank <= 3
        ? '🥈 On the podium! Fantastic work!'
        : myRank && myRank <= 5
        ? '🔥 In the Top 5! Keep going!'
        : '⚡ Great effort! Ready for the next round?';

    return (
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
          <div className="row row-2">
            <span className="badge badge-live">Live</span>
            <span className="chip">Q{currentIndex + 1}/{totalQuestions}</span>
          </div>
        </nav>

        <div className="main-content">
          <div className="container--narrow stack stack-6" style={{ margin: '0 auto' }}>
            {/* Rank message banner */}
            <div className="card text-center stack stack-2" style={{ background: 'var(--primary-light)', borderColor: 'rgba(57,82,211,0.2)' }}>
              <p className="t-headline" style={{ color: 'var(--primary)' }}>{motivational}</p>
              {myEntry && (
                <p className="t-body-md text-secondary">
                  Your Total Score: <strong>{myEntry.totalScore.toLocaleString()} pts</strong> ({myEntry.correctAnswers} correct)
                </p>
              )}
            </div>

            {/* Leaderboard */}
            <div className="card card--lg">
              <Leaderboard
                entries={leaderboard}
                myParticipantId={myParticipantId}
                showAll={false}
                title="🏆 Current Standings"
              />
            </div>

            <div className="card text-center" style={{ padding: '1rem', background: 'var(--surface-low)' }}>
              <div className="row row-2" style={{ justifyContent: 'center' }}>
                <span className="spinner spinner--sm" />
                <span className="t-label-sm text-secondary">Host is advancing to the next round…</span>
              </div>
            </div>
          </div>
        </div>
        {reactionsDock}
      </div>
    );
  }

  // ─── Step 6: Session Ended Screen ─────────────────────────────────────────
  if (step === 'ended') {
    const finalRank = myEntry?.rank;
    return (
      <div className="page" style={{ justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div className="stack stack-6">
            <div className="text-center stack stack-3">
              <div style={{ fontSize: '3.5rem', animation: 'bounce-in 0.5s var(--ease)' }}>🏆</div>
              <h1 className="t-headline">Quiz Finished!</h1>
              {finalRank && (
                <p className="t-body-lg" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                  You finished #{finalRank} with {myEntry?.totalScore.toLocaleString()} points!
                </p>
              )}
              <p className="t-body-md text-secondary">
                Thanks for participating in this PollMeter session.
              </p>
            </div>

            <div className="card card--lg">
              <Leaderboard
                entries={leaderboard}
                myParticipantId={myParticipantId}
                showAll={true}
                title="🏁 Final Results"
              />
            </div>

            <button
              className="btn btn-primary btn--lg btn--full"
              onClick={() => {
                localStorage.removeItem(LS_KEY);
                setStep('join');
                setCodeInput('');
                setNameInput('');
                setCurrentQuestion(null);
                setFeedback(null);
                setFinalData(null);
              }}
              id="join-new-btn"
            >
              Join Another Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading / Connecting
  return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="stack stack-3 text-center">
        <div className="spinner" />
        <p className="text-muted">Connecting to PollMeter…</p>
      </div>
    </div>
  );
}
