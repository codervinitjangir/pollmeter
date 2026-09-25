import { v4 as uuidv4 } from 'uuid';
import {
  Session,
  Question,
  PublicQuestion,
  Response,
  AggregatedResult,
  McqAggregated,
  TextAggregated,
  Participant,
  ParticipantRecord,
  LeaderboardEntry,
} from './types';

// ─── In-memory store ──────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();

/** Sessions are dropped after this much inactivity, so the Map can't grow forever. */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;   // 6h — covers a full teaching day
const ENDED_TTL_MS = 60 * 60 * 1000;      // 1h after the final podium
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/** A late answer still counts if it was in flight when the timer expired. */
export const LATE_GRACE_MS = 1500;

export const MAX_QUESTIONS = 50;
export const MAX_PARTICIPANTS = 300;
export const MAX_NAME_LENGTH = 24;
export const MAX_ANSWER_LENGTH = 300;

// ─── Code generation ──────────────────────────────────────────────────────────

function generateCode(): string {
  let code: string;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (sessions.has(code));
  return code;
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────

export function createSession(
  questions: Question[],
  meta?: { topic?: string; hostEmail?: string; hostName?: string }
): Session {
  const now = Date.now();
  const session: Session = {
    code: generateCode(),
    hostId: uuidv4(),
    topic: meta?.topic,
    hostEmail: meta?.hostEmail,
    hostName: meta?.hostName,
    questions,
    currentIndex: -1,
    maxAskedIndex: -1,
    phase: 'lobby',
    participants: new Map(),
    responses: {},
    timerStartedAt: null,
    unlocksAt: null,
    timerEndsAt: null,
    timerTimeout: null,
    leaderboard: new Map(),
    createdAt: now,
    lastActivityAt: now,
  };

  for (const q of questions) session.responses[q.id] = [];

  sessions.set(session.code, session);
  return session;
}

/**
 * Calculates a dynamic reading-time buffer (3s to 6s) based on question word count.
 * Shorter 1-line questions give 3s, longer scenario questions give up to 6s.
 */
export function calculateReadTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 10) return 4;
  if (words <= 20) return 5;
  return 6;
}

export function getSession(code: string): Session | undefined {
  return sessions.get(code);
}

export function touchSession(session: Session): void {
  session.lastActivityAt = Date.now();
}

export function deleteSession(code: string): void {
  const session = sessions.get(code);
  if (session?.timerTimeout) clearTimeout(session.timerTimeout);
  sessions.delete(code);
}

export function sessionCount(): number {
  return sessions.size;
}

/** Drop stale sessions. Returns how many were removed. */
export function sweepSessions(now = Date.now()): number {
  let removed = 0;
  for (const [code, session] of sessions) {
    const idle = now - session.lastActivityAt;
    const ttl = session.phase === 'ended' ? ENDED_TTL_MS : IDLE_TTL_MS;
    if (idle > ttl) {
      deleteSession(code);
      removed++;
    }
  }
  return removed;
}

export function startSessionSweeper(): ReturnType<typeof setInterval> {
  const handle = setInterval(() => {
    const removed = sweepSessions();
    if (removed > 0) console.log(`[store] swept ${removed} idle session(s)`);
  }, SWEEP_INTERVAL_MS);
  handle.unref?.();
  return handle;
}

// ─── Timer ────────────────────────────────────────────────────────────────────

/** Single source of truth for the outstanding timer — always cancel through here. */
export function clearSessionTimer(session: Session): void {
  if (session.timerTimeout) {
    clearTimeout(session.timerTimeout);
    session.timerTimeout = null;
  }
}

// ─── Participants ─────────────────────────────────────────────────────────────

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Two students called "Aditya" both deserve to find themselves on the board.
 * Second one becomes "Aditya (2)".
 */
function uniqueName(session: Session, desired: string, selfId?: string): string {
  const taken = new Set(
    Array.from(session.participants.values())
      .filter((p) => p.id !== selfId)
      .map((p) => p.name.toLowerCase())
  );
  if (!taken.has(desired.toLowerCase())) return desired;

  for (let n = 2; n < 100; n++) {
    const candidate = `${desired} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return desired;
}

export type JoinOutcome =
  | { ok: true; record: ParticipantRecord; isRejoin: boolean }
  | { ok: false; error: string };

/**
 * Rejoin is proved with a private token, never with the public participantId —
 * otherwise any student could resume as any classmate whose id they saw in a
 * `participants_updated` broadcast.
 */
export function addOrRejoinParticipant(
  session: Session,
  rawName: string,
  existingId?: string,
  rejoinToken?: string,
  auth?: { realName?: string; email?: string; userId?: string }
): JoinOutcome {
  const name = sanitizeName(rawName);
  if (!name) return { ok: false, error: 'Please enter your name.' };

  if (existingId && rejoinToken) {
    const existing = session.participants.get(existingId);
    if (existing && existing.token === rejoinToken) {
      existing.name = uniqueName(session, name, existing.id);
      existing.connected = true;
      if (auth?.realName) existing.realName = auth.realName;
      if (auth?.email) existing.email = auth.email;
      if (auth?.userId) existing.userId = auth.userId;

      const entry = session.leaderboard.get(existing.id);
      if (entry) {
        entry.name = existing.name;
        if (existing.realName) entry.realName = existing.realName;
        if (existing.email) entry.email = existing.email;
      }
      return { ok: true, record: existing, isRejoin: true };
    }
  }

  if (session.participants.size >= MAX_PARTICIPANTS) {
    return { ok: false, error: 'This session is full.' };
  }

  const record: ParticipantRecord = {
    id: uuidv4(),
    name: uniqueName(session, name),
    realName: auth?.realName,
    email: auth?.email,
    userId: auth?.userId,
    token: uuidv4(),
    connected: true,
    sockets: new Set(),
    joinedAt: Date.now(),
    lastGradedIndex: -1,
  };
  session.participants.set(record.id, record);

  session.leaderboard.set(record.id, {
    participantId: record.id,
    name: record.name,
    realName: record.realName,
    email: record.email,
    totalScore: 0,
    correctAnswers: 0,
    questionsAnswered: 0,
    rank: 0,
    streak: 0,
    bestStreak: 0,
  });

  return { ok: true, record, isRejoin: false };
}

/** Public view — deliberately omits `token`. RealName & email forwarded only to the host room. */
export function getParticipants(session: Session): Participant[] {
  return Array.from(session.participants.values())
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ id, name, realName, email, connected }) => ({ id, name, realName, email, connected }));
}

export function markSocketConnected(session: Session, participantId: string, socketId: string): void {
  const record = session.participants.get(participantId);
  if (!record) return;
  record.sockets.add(socketId);
  record.connected = true;
}

/** Returns true if this was the participant's last socket (they really left). */
export function markSocketDisconnected(session: Session, participantId: string, socketId: string): boolean {
  const record = session.participants.get(participantId);
  if (!record) return false;
  record.sockets.delete(socketId);
  if (record.sockets.size === 0) {
    record.connected = false;
    return true;
  }
  return false;
}

// ─── Questions ────────────────────────────────────────────────────────────────

/** What students are allowed to see — never ships `correctAnswer`. */
export function toPublicQuestion(question: Question): PublicQuestion {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options ? [...question.options] : undefined,
    timeLimitSeconds: question.timeLimitSeconds,
    graded: isGraded(question),
  };
}

/** A question only scores if it's MCQ *and* the mentor marked an answer. */
export function isGraded(question: Question): boolean {
  return (
    question.type === 'mcq' &&
    typeof question.correctAnswer === 'string' &&
    question.correctAnswer.length > 0 &&
    (question.options ?? []).includes(question.correctAnswer)
  );
}

export function getCurrentQuestion(session: Session): Question | null {
  if (session.currentIndex < 0) return null;
  return session.questions[session.currentIndex] ?? null;
}

// ─── Responses ────────────────────────────────────────────────────────────────

export function findResponse(
  session: Session,
  questionId: string,
  participantId: string
): Response | undefined {
  return session.responses[questionId]?.find((r) => r.participantId === participantId);
}

export type SubmitOutcome =
  | { ok: true; response: Response }
  | { ok: false; error: string };

export function addResponse(
  session: Session,
  questionId: string,
  participantId: string,
  rawValue: string
): SubmitOutcome {
  const question = session.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: 'Unknown question.' };

  if (!session.responses[questionId]) session.responses[questionId] = [];

  if (findResponse(session, questionId, participantId)) {
    return { ok: false, error: 'You already answered this question.' };
  }

  const value = rawValue.trim().slice(0, MAX_ANSWER_LENGTH);
  if (!value) return { ok: false, error: 'Answer cannot be empty.' };

  if (question.type === 'mcq' && !(question.options ?? []).includes(value)) {
    return { ok: false, error: 'That option is not on this question.' };
  }

  const graded = isGraded(question);
  const answeredAt = Date.now();
  const isCorrect = graded ? question.correctAnswer === value : false;
  const score = graded
    ? computeScore(question, isCorrect, answeredAt, session.unlocksAt ?? session.timerStartedAt)
    : 0;

  const response: Response = {
    questionId,
    participantId,
    value,
    answeredAt,
    isCorrect,
    graded,
    score,
  };

  session.responses[questionId].push(response);
  updateLeaderboardEntry(session, participantId, response);

  return { ok: true, response };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * 1000 for a correct answer, plus up to 500 for speed (linear over the time
 * limit). Ungraded questions never reach here — a poll has no right answer, so
 * it must not move the leaderboard.
 */
export function computeScore(
  question: Question,
  isCorrect: boolean,
  answeredAt: number,
  timerStartedAt: number | null
): number {
  if (!isCorrect) return 0;

  let score = 1000;

  if (timerStartedAt && question.timeLimitSeconds > 0) {
    const elapsed = Math.max(0, answeredAt - timerStartedAt) / 1000;
    const ratio = Math.min(1, elapsed / question.timeLimitSeconds);
    score += Math.round(500 * (1 - ratio));
  }

  return score;
}

function updateLeaderboardEntry(
  session: Session,
  participantId: string,
  response: Response
): void {
  const entry = session.leaderboard.get(participantId);
  if (!entry) return;

  entry.totalScore += response.score;
  entry.questionsAnswered += 1;
  if (response.graded && response.isCorrect) entry.correctAnswers += 1;

  updateStreak(session, participantId, entry, response);
}

/**
 * Consecutive correct answers, counted over *graded* questions only.
 *
 * Ungraded polls are ignored outright — breaking someone's streak because a
 * word cloud had no right answer would be nonsense. Skipping a graded question
 * *does* break it: a streak you can keep by ducking the hard ones isn't a
 * streak, which is why we remember the last graded index each participant
 * answered and check whether anything gradeable went by in between.
 *
 * A latecomer starts at -1, so every question before they joined counts as
 * skipped — their first correct answer opens a streak at 1 rather than
 * inheriting credit for questions they never saw.
 */
function updateStreak(
  session: Session,
  participantId: string,
  entry: LeaderboardEntry,
  response: Response
): void {
  if (!response.graded) return;

  const record = session.participants.get(participantId);
  if (!record) return;

  const index = session.questions.findIndex((q) => q.id === response.questionId);
  if (index < 0) return;

  const skippedGraded = session.questions
    .slice(record.lastGradedIndex + 1, index)
    .some((q) => isGraded(q));

  record.lastGradedIndex = index;

  entry.streak = response.isCorrect ? (skippedGraded ? 1 : entry.streak + 1) : 0;
  if (entry.streak > entry.bestStreak) entry.bestStreak = entry.streak;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

/**
 * Ties share a rank (1, 2, 2, 4) — telling two students on identical scores
 * that one of them is "ahead" is just wrong.
 */
export function getLeaderboard(session: Session): LeaderboardEntry[] {
  const sorted = Array.from(session.leaderboard.values()).sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      b.correctAnswers - a.correctAnswers ||
      a.name.localeCompare(b.name)
  );

  let lastScore: number | null = null;
  let lastRank = 0;

  return sorted.map((entry, idx) => {
    const rank = entry.totalScore === lastScore ? lastRank : idx + 1;
    lastScore = entry.totalScore;
    lastRank = rank;
    return { ...entry, rank };
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregateResults(session: Session, questionId: string): AggregatedResult {
  const question = session.questions.find((q) => q.id === questionId);
  const responses = session.responses[questionId] ?? [];

  if (!question) return {};

  if (question.type === 'mcq') {
    const counts: McqAggregated = {};
    for (const opt of question.options ?? []) counts[opt] = 0;
    for (const r of responses) {
      if (r.value in counts) counts[r.value]++;
    }
    return counts;
  }

  const texts: TextAggregated = responses.map((r) => r.value);
  return texts;
}

export function responseCount(session: Session, questionId: string): number {
  return session.responses[questionId]?.length ?? 0;
}

export function buildFinalResults(session: Session): Record<string, AggregatedResult> {
  const result: Record<string, AggregatedResult> = {};
  for (const q of session.questions) result[q.id] = aggregateResults(session, q.id);
  return result;
}
