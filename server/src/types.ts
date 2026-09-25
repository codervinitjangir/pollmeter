// ─── Shared data-model types ────────────────────────────────────────────────

export type QuestionType = 'mcq' | 'open_text';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];          // Only for MCQ
  correctAnswer?: string;      // MCQ + answer key = graded quiz question
  timeLimitSeconds: number;
  /**
   * Review metadata, set only by AI generation and only for the mentor's eyes.
   *
   * `covers` is the syllabus section the question came from — the mentor's
   * complaint was that generated sets silently clustered on one unit, and a
   * label per question makes that visible at a glance instead of requiring them
   * to read all twenty and notice.
   *
   * `why` is the model's one-line justification for the answer key. A mentor
   * skimming a set can't otherwise tell a confident wrong key from a right one,
   * and hallucinated answers tend to arrive with visibly weak reasoning.
   *
   * Neither is forwarded by `toPublicQuestion`, so students never receive them.
   */
  covers?: string;
  why?: string;
}

/**
 * Presenter-driven phase machine. Every transition is an explicit host action
 * (or the question timer expiring); nothing auto-advances behind the mentor's
 * back. Exactly one `timerTimeout` is ever outstanding per session.
 *
 *   lobby ──start──▶ question ──expiry|lock──▶ results ──▶ leaderboard ──next──▶ question…
 *                                                    └──────next──────┘        └──▶ ended
 */
export type SessionPhase = 'lobby' | 'question' | 'results' | 'leaderboard' | 'ended';

export interface Response {
  questionId: string;
  participantId: string;
  value: string;
  answeredAt: number;          // epoch ms — for speed scoring
  isCorrect: boolean;
  graded: boolean;             // false for polls / open text (no answer key)
  score: number;               // 0 for ungraded, 0–1500 for graded
}

export interface LeaderboardEntry {
  participantId: string;
  name: string;
  realName?: string;
  email?: string;
  totalScore: number;
  correctAnswers: number;
  questionsAnswered: number;
  rank: number;
  /** Consecutive correct answers right now, over graded questions only. */
  streak: number;
  /** Longest streak this session — survives a wrong answer, for the recap. */
  bestStreak: number;
}

export interface Participant {
  id: string;
  name: string;
  realName?: string;
  email?: string;
  connected: boolean;
}

export interface ParticipantRecord {
  id: string;
  name: string;
  realName?: string;
  email?: string;
  userId?: string;
  /** Private rejoin secret. Never broadcast — only returned to its own socket. */
  token: string;
  connected: boolean;
  /** Live socket ids for this participant (a phone + a laptop both count). */
  sockets: Set<string>;
  joinedAt: number;
  /**
   * Index of the last graded question this participant answered, -1 for none.
   * Server-side bookkeeping for the streak: it's how we notice someone skipped
   * a graded question rather than answering it. Never broadcast.
   */
  lastGradedIndex: number;
}

export interface Session {
  code: string;
  hostId: string;
  topic?: string;
  hostEmail?: string;
  hostName?: string;
  questions: Question[];
  currentIndex: number;          // -1 = lobby
  /**
   * Highest index actually put on screen. Navigating at or below it is a
   * *review* of the recorded result, never a re-run — otherwise going back to
   * discuss question 3 would re-open voting on it, and every student who
   * already answered would tap into a rejection.
   */
  maxAskedIndex: number;
  phase: SessionPhase;
  participants: Map<string, ParticipantRecord>;  // participantId → record
  responses: Record<string, Response[]>;         // questionId → Response[]
  timerStartedAt: number | null;
  unlocksAt: number | null;
  timerEndsAt: number | null;
  timerTimeout: ReturnType<typeof setTimeout> | null;
  leaderboard: Map<string, LeaderboardEntry>;
  createdAt: number;
  lastActivityAt: number;
}

// ─── Aggregated results ───────────────────────────────────────────────────────

export type McqAggregated = Record<string, number>;  // option → count
export type TextAggregated = string[];
export type AggregatedResult = McqAggregated | TextAggregated;

// ─── Socket payload shapes ─── Client → Server ────────────────────────────────

export interface JoinSessionPayload {
  code: string;
  name: string;
  participantId?: string;
  rejoinToken?: string;
  authToken?: string;
  realName?: string;
  email?: string;
}

export interface SubmitResponsePayload {
  code: string;
  questionId: string;
  value: string;
}

/** Every host command carries the same proof-of-host shape. */
export interface HostCommandPayload {
  code: string;
  hostId: string;
}

export interface HostExtendTimePayload extends HostCommandPayload {
  seconds: number;
}

// ─── Socket payload shapes ─── Server → Client ────────────────────────────────

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  timeLimitSeconds: number;
  /** True when an answer key exists — the key itself is never sent early. */
  graded: boolean;
}

export interface SessionStatePayload {
  code: string;
  phase: SessionPhase;
  questionCount: number;
  currentIndex: number;
  question: PublicQuestion | null;
  participantId: string;
  rejoinToken: string;
  name: string;
  participantCount: number;
  alreadyAnswered: boolean;
  myAnswer: string | null;
  myFeedback: ResponseAcceptedPayload | null;
  results: AggregatedResult | null;
  responseCount: number;
  correctAnswer?: string;
  timerStartedAt: number | null;
  unlocksAt?: number | null;
  readTimeSeconds?: number | null;
  timerEndsAt: number | null;
  leaderboard: LeaderboardEntry[];
}

export interface HostStatePayload {
  code: string;
  phase: SessionPhase;
  questions: Question[];
  currentIndex: number;
  participants: Participant[];
  results: AggregatedResult | null;
  responseCount: number;
  timerStartedAt: number | null;
  unlocksAt?: number | null;
  readTimeSeconds?: number | null;
  timerEndsAt: number | null;
  leaderboard: LeaderboardEntry[];
  finalResults?: Record<string, AggregatedResult>;
}

export interface QuestionStartedPayload {
  question: PublicQuestion;
  index: number;
  questionCount: number;
  timerStartedAt: number;
  unlocksAt?: number;
  readTimeSeconds?: number;
  timerEndsAt: number;
}

export interface ResponseCountPayload {
  questionId: string;
  responseCount: number;
  participantCount: number;
  /** Live distribution — only sent for ungraded poll questions. */
  results?: AggregatedResult;
}

export interface ResultsRevealedPayload {
  questionId: string;
  aggregated: AggregatedResult;
  responseCount: number;
  participantCount: number;
  correctAnswer?: string;
}

export interface ResponseAcceptedPayload {
  questionId: string;
  value: string;
  isCorrect: boolean;
  graded: boolean;
  score: number;
}

export interface LeaderboardPayload {
  leaderboard: LeaderboardEntry[];
  questionId: string;
  questionIndex: number;
  questionCount: number;
  correctAnswer?: string;
}

export interface SessionEndedPayload {
  finalResults: Record<string, AggregatedResult>;
  questions: Question[];
  leaderboard: LeaderboardEntry[];
}

export interface ErrorPayload {
  message: string;
  fatal?: boolean;
}

export interface ParticipantsUpdatedPayload {
  participants: Participant[];
  count: number;
}
