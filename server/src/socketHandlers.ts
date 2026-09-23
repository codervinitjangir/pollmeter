import { Server, Socket } from 'socket.io';
import {
  getSession,
  touchSession,
  clearSessionTimer,
  addOrRejoinParticipant,
  getParticipants,
  markSocketConnected,
  markSocketDisconnected,
  addResponse,
  findResponse,
  aggregateResults,
  responseCount,
  buildFinalResults,
  getLeaderboard,
  getCurrentQuestion,
  toPublicQuestion,
  isGraded,
  sanitizeName,
  LATE_GRACE_MS,
  MAX_ANSWER_LENGTH,
} from './sessionStore';
import {
  Session,
  JoinSessionPayload,
  SubmitResponsePayload,
  HostCommandPayload,
  HostExtendTimePayload,
  SessionStatePayload,
  HostStatePayload,
  ResponseAcceptedPayload,
} from './types';

/** Host-only broadcasts (participant names/ids) go to this room, never to students. */
const hostRoom = (code: string) => `host:${code}`;

const ALLOWED_REACTIONS = ['👍', '❤️', '👏', '🔥', '💡'];
const REACTION_WINDOW_MS = 3000;
const REACTION_LIMIT = 5;

/**
 * 50 students answering inside two seconds would otherwise mean 50 broadcasts to
 * 50 clients. Coalesce the live counter into at most one frame per tick.
 */
const COUNT_BROADCAST_MS = 250;
const pendingCountBroadcast = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Broadcast helpers ────────────────────────────────────────────────────────

function emitPhase(io: Server, session: Session): void {
  io.to(session.code).emit('phase_changed', {
    phase: session.phase,
    currentIndex: session.currentIndex,
    questionCount: session.questions.length,
  });
}

function emitParticipants(io: Server, session: Session): void {
  io.to(hostRoom(session.code)).emit('participants_updated', {
    participants: getParticipants(session),
    count: session.participants.size,
  });
  // Students only ever learn how many people are in the room, not who they are.
  io.to(session.code).emit('participant_count', {
    count: session.participants.size,
  });
}

function emitResponseCount(io: Server, session: Session): void {
  const question = getCurrentQuestion(session);
  if (!question) return;

  const payload: Record<string, unknown> = {
    questionId: question.id,
    responseCount: responseCount(session, question.id),
    participantCount: session.participants.size,
  };

  // A poll has no right answer, so watching the bars fill is the whole point.
  // A graded question must stay hidden or the room just copies the leader.
  if (!isGraded(question)) {
    payload.results = aggregateResults(session, question.id);
  }

  io.to(session.code).emit('response_count', payload);
}

function scheduleCountBroadcast(io: Server, session: Session): void {
  const code = session.code;
  if (pendingCountBroadcast.has(code)) return;

  const handle = setTimeout(() => {
    pendingCountBroadcast.delete(code);
    const live = getSession(code);
    if (live && live.phase === 'question') emitResponseCount(io, live);
  }, COUNT_BROADCAST_MS);
  handle.unref?.();

  pendingCountBroadcast.set(code, handle);
}

function emitResults(io: Server, session: Session): void {
  const question = getCurrentQuestion(session);
  if (!question) return;

  io.to(session.code).emit('results_revealed', {
    questionId: question.id,
    aggregated: aggregateResults(session, question.id),
    responseCount: responseCount(session, question.id),
    participantCount: session.participants.size,
    correctAnswer: isGraded(question) ? question.correctAnswer : undefined,
  });
  io.to(session.code).emit('results_updated', {
    aggregated: aggregateResults(session, question.id),
  });

  // Reveal each student's own result only after the question is locked. This
  // prevents the first fast answer from teaching the room the answer key.
  for (const participant of session.participants.values()) {
    const response = findResponse(session, question.id, participant.id);
    if (!response) continue;
    for (const socketId of participant.sockets) {
      io.to(socketId).emit('response_feedback', {
        questionId: response.questionId,
        value: response.value,
        isCorrect: response.isCorrect,
        graded: response.graded,
        score: response.score,
        correctAnswer: isGraded(question) ? question.correctAnswer : undefined,
      });
    }
  }
}

function emitLeaderboard(io: Server, session: Session): void {
  const question = getCurrentQuestion(session);

  io.to(session.code).emit('leaderboard_updated', {
    leaderboard: getLeaderboard(session),
    questionId: question?.id ?? '',
    questionIndex: session.currentIndex,
    questionCount: session.questions.length,
    correctAnswer: question && isGraded(question) ? question.correctAnswer : undefined,
  });
}

// ─── Phase transitions ────────────────────────────────────────────────────────

/** lobby | leaderboard | results ──▶ question(index) */
function startQuestion(io: Server, session: Session, index: number): void {
  clearSessionTimer(session);

  const question = session.questions[index];
  if (!question) {
    endSession(io, session);
    return;
  }

  const startedAt = Date.now();
  const endsAt = startedAt + question.timeLimitSeconds * 1000;

  session.currentIndex = index;
  session.phase = 'question';
  session.timerStartedAt = startedAt;
  session.timerEndsAt = endsAt;
  touchSession(session);

  io.to(session.code).emit('question_started', {
    question: toPublicQuestion(question),
    index,
    questionCount: session.questions.length,
    timerStartedAt: startedAt,
    timerEndsAt: endsAt,
  });

  // Students must only receive the public form. The host gets the answer key
  // through a separate room so it can reveal it after the timer expires.
  io.to(session.code).emit('question_changed', {
    question: toPublicQuestion(question),
    index,
    timerStartedAt: startedAt,
    questionCount: session.questions.length,
  });

  io.to(hostRoom(session.code)).emit('host_question_changed', {
    question,
    index,
    timerStartedAt: startedAt,
    questionCount: session.questions.length,
  });

  io.to(session.code).emit('timer_started', {
    startedAt,
    durationSeconds: question.timeLimitSeconds,
  });

  emitResponseCount(io, session);

  // The only timer in the system. On expiry we lock answers and show results —
  // we never chain into a second timeout the host is unable to cancel.
  session.timerTimeout = setTimeout(() => {
    const live = getSession(session.code);
    if (live && live.phase === 'question' && live.currentIndex === index) {
      lockAnswers(io, live);
    }
  }, question.timeLimitSeconds * 1000);
}

/** question ──▶ results (answers closed, distribution + answer key revealed) */
function lockAnswers(io: Server, session: Session): void {
  if (session.phase !== 'question') return;

  clearSessionTimer(session);
  session.phase = 'results';
  session.timerEndsAt = Date.now();
  touchSession(session);

  emitPhase(io, session);
  emitResults(io, session);
}

/** results ──▶ leaderboard */
function showLeaderboard(io: Server, session: Session): void {
  if (session.phase !== 'results' && session.phase !== 'question') return;

  if (session.phase === 'question') clearSessionTimer(session);
  session.phase = 'leaderboard';
  touchSession(session);

  emitPhase(io, session);
  emitLeaderboard(io, session);
}

function endSession(io: Server, session: Session): void {
  clearSessionTimer(session);
  session.phase = 'ended';
  touchSession(session);

  io.to(session.code).emit('session_ended', {
    finalResults: buildFinalResults(session),
    questions: session.questions,
    leaderboard: getLeaderboard(session),
  });
}

// ─── State snapshots (used on join and on every reconnect) ────────────────────

function buildStudentState(
  session: Session,
  participantId: string,
  name: string,
  rejoinToken: string
): SessionStatePayload {
  const question = getCurrentQuestion(session);
  const mine = question ? findResponse(session, question.id, participantId) : undefined;
  const revealed = session.phase === 'results' || session.phase === 'leaderboard';

  let results = null;
  if (question) {
    if (revealed || (session.phase === 'question' && !isGraded(question))) {
      results = aggregateResults(session, question.id);
    }
  }

  return {
    code: session.code,
    phase: session.phase,
    questionCount: session.questions.length,
    currentIndex: session.currentIndex,
    question: question ? toPublicQuestion(question) : null,
    participantId,
    rejoinToken,
    name,
    participantCount: session.participants.size,
    alreadyAnswered: Boolean(mine),
    myAnswer: mine?.value ?? null,
    myFeedback: revealed && mine
      ? {
          questionId: mine.questionId,
          value: mine.value,
          isCorrect: mine.isCorrect,
          graded: mine.graded,
          score: mine.score,
        }
      : null,
    results,
    responseCount: question ? responseCount(session, question.id) : 0,
    correctAnswer:
      revealed && question && isGraded(question) ? question.correctAnswer : undefined,
    timerStartedAt: session.timerStartedAt,
    timerEndsAt: session.timerEndsAt,
    leaderboard: getLeaderboard(session),
  };
}

function buildHostState(session: Session): HostStatePayload {
  const question = getCurrentQuestion(session);
  const revealed = session.phase === 'results' || session.phase === 'leaderboard';

  let results = null;
  if (question && (revealed || !isGraded(question))) {
    results = aggregateResults(session, question.id);
  }

  return {
    code: session.code,
    phase: session.phase,
    questions: session.questions,
    currentIndex: session.currentIndex,
    participants: getParticipants(session),
    results,
    responseCount: question ? responseCount(session, question.id) : 0,
    timerStartedAt: session.timerStartedAt,
    timerEndsAt: session.timerEndsAt,
    leaderboard: getLeaderboard(session),
    finalResults: session.phase === 'ended' ? buildFinalResults(session) : undefined,
  };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

function requireHost(socket: Socket, payload: HostCommandPayload): Session | null {
  const session = getSession(payload?.code);
  if (!session) {
    socket.emit('error', { message: `Session ${payload?.code ?? ''} not found.` });
    return null;
  }
  if (session.hostId !== payload.hostId) {
    socket.emit('error', { message: 'You are not the host of this session.' });
    return null;
  }
  return session;
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // ─── Host attaches (first time, or after a projector-laptop refresh) ──────
  socket.on('host_join', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;

    socket.data.hostOf = session.code;
    socket.join(session.code);
    socket.join(hostRoom(session.code));
    touchSession(session);

    socket.emit('host_state', buildHostState(session));
    emitParticipants(io, session);
  });

  socket.on('host_start', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;
    if (session.phase !== 'lobby') return;            // idempotent: ignore double-click
    if (session.questions.length === 0) {
      socket.emit('error', { message: 'Add at least one question first.' });
      return;
    }
    startQuestion(io, session, 0);
  });

  socket.on('host_start_session', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;
    if (session.phase !== 'lobby') return;
    if (session.questions.length === 0) {
      socket.emit('error', { message: 'Add at least one question first.' });
      return;
    }
    startQuestion(io, session, 0);
  });

  /** Close answers early and reveal the distribution. */
  socket.on('host_lock', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session || session.phase !== 'question') return;
    lockAnswers(io, session);
  });

  socket.on('host_show_leaderboard', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;
    showLeaderboard(io, session);
  });

  /**
   * Advance. Guarded on phase, so a mentor mashing the button during the
   * leaderboard can never skip a question the class hasn't seen.
   */
  socket.on('host_next', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;
    if (session.phase === 'lobby' || session.phase === 'ended') return;

    const nextIndex = session.currentIndex + 1;
    if (nextIndex >= session.questions.length) endSession(io, session);
    else startQuestion(io, session, nextIndex);
  });

  socket.on('host_next_question', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session) return;
    if (session.phase === 'lobby' || session.phase === 'ended') return;

    // If currently on active question, advance to leaderboard first
    if (session.phase === 'question') {
      showLeaderboard(io, session);
      return;
    }

    const nextIndex = session.currentIndex + 1;
    if (nextIndex >= session.questions.length) endSession(io, session);
    else startQuestion(io, session, nextIndex);
  });

  socket.on('host_previous', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session || session.phase === 'lobby' || session.phase === 'ended') return;
    if (session.currentIndex <= 0) return;
    startQuestion(io, session, session.currentIndex - 1);
  });

  socket.on('host_extend_time', (payload: HostExtendTimePayload) => {
    const session = requireHost(socket, payload);
    if (!session || session.phase !== 'question') return;

    const seconds = Math.min(120, Math.max(5, Math.round(Number(payload.seconds) || 15)));
    const question = getCurrentQuestion(session);
    if (!question || !session.timerEndsAt) return;

    clearSessionTimer(session);
    session.timerEndsAt += seconds * 1000;
    touchSession(session);

    const remaining = Math.max(0, session.timerEndsAt - Date.now());
    io.to(session.code).emit('timer_updated', {
      questionId: question.id,
      timerStartedAt: session.timerStartedAt,
      timerEndsAt: session.timerEndsAt,
    });

    const index = session.currentIndex;
    session.timerTimeout = setTimeout(() => {
      const live = getSession(session.code);
      if (live && live.phase === 'question' && live.currentIndex === index) {
        lockAnswers(io, live);
      }
    }, remaining);
  });

  socket.on('host_end', (payload: HostCommandPayload) => {
    const session = requireHost(socket, payload);
    if (!session || session.phase === 'ended') return;
    endSession(io, session);
  });

  // ─── Student joins / rejoins ──────────────────────────────────────────────
  socket.on('join_session', (payload: JoinSessionPayload) => {
    const code = String(payload?.code ?? '').trim();
    const session = getSession(code);

    if (!session) {
      socket.emit('error', { message: `No session found with code ${code}.` });
      return;
    }
    if (session.phase === 'ended') {
      socket.emit('error', { message: 'This session has already finished.' });
      return;
    }

    const outcome = addOrRejoinParticipant(
      session,
      sanitizeName(String(payload?.name ?? '')),
      payload?.participantId,
      payload?.rejoinToken
    );

    if (!outcome.ok) {
      socket.emit('error', { message: outcome.error });
      return;
    }

    const { record } = outcome;
    socket.data.participantId = record.id;
    socket.data.sessionCode = code;
    socket.join(code);
    markSocketConnected(session, record.id, socket.id);
    touchSession(session);

    socket.emit('session_state', buildStudentState(session, record.id, record.name, record.token));
    emitParticipants(io, session);
  });

  // ─── Student answers ──────────────────────────────────────────────────────
  socket.on('submit_response', (payload: SubmitResponsePayload) => {
    const participantId = socket.data.participantId as string | undefined;
    if (!participantId) {
      socket.emit('error', { message: 'You are not in a session. Please rejoin.' });
      return;
    }

    const code = String(payload?.code ?? '').trim();
    if (socket.data.sessionCode !== code) {
      socket.emit('error', { message: 'You are not joined to that session.' });
      return;
    }

    const session = getSession(code);
    if (!session) {
      socket.emit('error', { message: 'Session not found.' });
      return;
    }

    if (!session.participants.has(participantId)) {
      socket.emit('error', { message: 'Your participant session is no longer valid. Please rejoin.' });
      return;
    }

    // Answers are only open during the question phase. Without this the
    // 3-second gap before the leaderboard was a free 1000 points.
    if (session.phase !== 'question') {
      socket.emit('error', { message: 'Answers are closed for this question.' });
      return;
    }

    const question = getCurrentQuestion(session);
    if (!question || question.id !== payload?.questionId) {
      socket.emit('error', { message: 'That question is no longer on screen.' });
      return;
    }

    if (session.timerEndsAt && Date.now() > session.timerEndsAt + LATE_GRACE_MS) {
      socket.emit('error', { message: "Time's up for this question." });
      return;
    }

    const outcome = addResponse(
      session,
      question.id,
      participantId,
      String(payload?.value ?? '').slice(0, MAX_ANSWER_LENGTH)
    );

    if (!outcome.ok) {
      socket.emit('error', { message: outcome.error });
      return;
    }

    touchSession(session);

    const feedback: ResponseAcceptedPayload = {
      questionId: question.id,
      value: outcome.response.value,
      isCorrect: outcome.response.isCorrect,
      graded: outcome.response.graded,
      score: outcome.response.score,
    };
    socket.emit('response_submitted', {
      questionId: feedback.questionId,
      value: feedback.value,
    });

    scheduleCountBroadcast(io, session);
  });

  // ─── Reactions ────────────────────────────────────────────────────────────
  socket.on('send_reaction', (payload: { code: string; emoji: string }) => {
    const code = String(payload?.code ?? '');
    const emoji = String(payload?.emoji ?? '');

    // Must be in the room, must be one of ours, must not be spammed — this is a
    // projector in front of a class, not a free canvas.
    if (socket.data.sessionCode !== code) return;
    if (!ALLOWED_REACTIONS.includes(emoji)) return;

    const now = Date.now();
    const bucket = (socket.data.reactionTimes as number[] | undefined) ?? [];
    const recent = bucket.filter((t) => now - t < REACTION_WINDOW_MS);
    if (recent.length >= REACTION_LIMIT) return;
    recent.push(now);
    socket.data.reactionTimes = recent;

    const session = getSession(code);
    if (!session || session.phase === 'ended') return;

    io.to(code).emit('reaction_received', {
      emoji,
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    });
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.data.sessionCode as string | undefined;
    const participantId = socket.data.participantId as string | undefined;
    if (!code || !participantId) return;

    const session = getSession(code);
    if (!session) return;

    const fullyGone = markSocketDisconnected(session, participantId, socket.id);
    if (fullyGone) emitParticipants(io, session);
  });
}
