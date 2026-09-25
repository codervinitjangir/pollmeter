export type QuestionType = 'mcq' | 'open_text';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: string;
  timeLimitSeconds: number;
  /**
   * Mentor-facing review metadata from AI generation. `covers` is the syllabus
   * section the question was drawn from, `why` is the model's one-line case for
   * the answer key. Both optional: hand-written questions have neither, and a
   * model that ignores the fields costs a label rather than the question.
   */
  covers?: string;
  why?: string;
}

/** What a student's browser is allowed to know — never carries the answer key. */
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  timeLimitSeconds: number;
  graded: boolean;
}

export type SessionPhase = 'lobby' | 'question' | 'results' | 'leaderboard' | 'ended' | 'active';
export type SessionStatus = SessionPhase;

export interface Participant {
  id: string;
  name: string;
  connected: boolean;
}

export interface LeaderboardEntry {
  participantId: string;
  name: string;
  totalScore: number;
  correctAnswers: number;
  questionsAnswered: number;
  rank: number;
  /**
   * Consecutive correct answers, graded questions only. Optional on purpose:
   * a client left open across a server restart would otherwise render `NaN`
   * on the projector rather than simply omitting the badge.
   */
  streak?: number;
  bestStreak?: number;
}

export type McqAggregated = Record<string, number>;
export type TextAggregated = string[];
export type AggregatedResult = McqAggregated | TextAggregated;

// ─── Server → client ──────────────────────────────────────────────────────────

export interface ResponseAcceptedPayload {
  questionId: string;
  value: string;
  isCorrect: boolean;
  graded: boolean;
  score: number;
  correctAnswer?: string;
}

export interface SessionStatePayload {
  code: string;
  phase: SessionPhase;
  status?: SessionPhase;
  questionCount: number;
  currentIndex: number;
  question: PublicQuestion | null;
  questions?: Question[];
  participantId: string;
  rejoinToken: string;
  name: string;
  participantCount: number;
  alreadyAnswered: boolean;
  myAnswer: string | null;
  myFeedback: ResponseAcceptedPayload | null;
  results: AggregatedResult | null;
  currentResults?: AggregatedResult | null;
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

/** Host stepped back to an already-answered question: shown read-only. */
export interface QuestionReviewedPayload {
  question: PublicQuestion;
  index: number;
  questionCount: number;
}

export interface QuestionChangedPayload {
  question: Question;
  index: number;
  timerStartedAt: number;
  unlocksAt?: number;
  readTimeSeconds?: number;
  questionCount?: number;
}

export interface ResultsUpdatedPayload {
  aggregated: AggregatedResult;
  questionId?: string;
  responseCount?: number;
  participantCount?: number;
  correctAnswer?: string;
}

export interface TimerStartedPayload {
  startedAt: number;
  unlocksAt?: number | null;
  readTimeSeconds?: number | null;
  durationSeconds: number;
  questionId?: string;
  timerEndsAt?: number | null;
}

export interface PhaseChangedPayload {
  phase: SessionPhase;
  currentIndex: number;
  questionCount: number;
}

export interface ResponseCountPayload {
  questionId: string;
  responseCount: number;
  participantCount: number;
  results?: AggregatedResult;
}

export interface ResultsRevealedPayload {
  questionId: string;
  aggregated: AggregatedResult;
  responseCount: number;
  participantCount: number;
  correctAnswer?: string;
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

export interface TimerUpdatedPayload {
  questionId: string;
  timerStartedAt: number | null;
  timerEndsAt: number | null;
}

export interface ParticipantsUpdatedPayload {
  participants: Participant[];
  count: number;
}

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  reason?: string;
}

/**
 * Payload of the `error` socket event.
 *
 * `fatal` marks the errors that mean the session — or this client's place in it
 * — is gone for good rather than one action having been refused. In practice
 * that is a backend restart: sessions live in memory, so a redeploy or crash
 * wipes them while phones are still mid-question. Both pages tear down their
 * stored identity when they see it; everything without it is recoverable and
 * must stay recoverable, or a transient hiccup would eject a whole class.
 */
export interface SocketErrorPayload {
  message: string;
  fatal?: boolean;
}
