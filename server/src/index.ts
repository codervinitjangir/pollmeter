import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import {
  createSession,
  getSession,
  startSessionSweeper,
  sessionCount,
  MAX_QUESTIONS,
} from './sessionStore';
import { registerSocketHandlers } from './socketHandlers';
import { handleGenerateQuestions, getAiStatus } from './aiHandler';
import { Question, QuestionType } from './types';
import {
  initDb,
  saveQuizSession,
  getMentorQuizzes,
  getQuizDetails,
  getStudentQuizzes,
  getAllFaculty,
  addOrUpdateFaculty,
  removeFaculty,
  setUserRole,
  setUserApproval,
  countAdmins,
  getUserByEmail,
  getUniversityOverview,
  searchStudents,
  STANDARD_BATCHES,
  recordAuditLog,
  getRecentAuditLogs,
  closePool,
} from './db';
import {
  getAllowedDomains,
  authenticateGoogleUser,
  authenticateDevDemoUser,
  sendCollegeOtp,
  verifyCollegeOtp,
  verifyAndPromoteMentorPin,
  resolveEffectiveRole,
  isFacultyDomain,
  generateToken,
  FACULTY_DOMAIN,
  requireAuth,
  requireMentor,
  requireAdmin,
  AuthenticatedRequest,
} from './auth';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── CORS ─────────────────────────────────────────────────────────────────────

/**
 * Students join from phones on the classroom wifi, so the origin is whatever
 * LAN address the laptop happens to have. Allow localhost, private ranges,
 * and known deployment domains (Cloudflare Pages, Vercel, Netlify).
 */
const PRIVATE_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+|[\w-]+\.local)(:\d+)?$/i;
const DEPLOY_ORIGIN  = /^https:\/\/([\w-]+\.pages\.dev|[\w-]+\.vercel\.app|[\w-]+\.netlify\.app|[\w-]+\.onrender\.com)(:\d+)?$/i;

const extraOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;                        // curl, same-origin, QR scanners
  if (extraOrigins.includes(origin)) return true;
  if (PRIVATE_ORIGIN.test(origin)) return true;
  if (DEPLOY_ORIGIN.test(origin)) return true;
  return false;
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) =>
    isAllowedOrigin(origin)
      ? callback(null, true)
      : callback(new Error(`Origin ${origin} is not allowed.`)),
  // DELETE is needed for revoking a faculty member; without it the browser's
  // preflight for that route fails cross-origin.
  methods: ['GET', 'POST', 'DELETE'],
};

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', true);
app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

/**
 * The handful of response headers that matter for an app like this, set by
 * hand rather than pulling in helmet — the same reasoning as the rate limiter
 * below. No CSP: the client loads Google Identity Services at runtime, and a
 * policy narrow enough to be worth having would need the script hashes that
 * only the Vite build knows.
 */
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// These endpoints can allocate memory or spend an external AI quota. Keep a
// small dependency-free limiter in front of them; the classroom socket flow is
// intentionally not limited by this HTTP limiter.
function rateLimit(windowMs: number, maxRequests: number) {
  const hits = new Map<string, { startedAt: number; count: number }>();

  // Periodically clean up expired entries to prevent memory accumulation
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now - record.startedAt >= windowMs) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 60_000));
  timer.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = hits.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      hits.set(key, { startedAt: now, count: 1 });
      next();
      return;
    }
    current.count += 1;
    if (current.count > maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }
    next();
  };
}

const sessionCreationLimiter = rateLimit(60_000, 30);
const aiGenerationLimiter = rateLimit(60_000, 10);

// Both of these hand out or check a credential, so they are brute-force
// targets in a way the rest of the API is not.
const otpSendLimiter = rateLimit(15 * 60_000, 5);
const pinAttemptLimiter = rateLimit(15 * 60_000, 10);
const bootstrapLimiter = rateLimit(60 * 60_000, 5);

// ─── Question validation ──────────────────────────────────────────────────────

const ALLOWED_TIME_LIMITS = [10, 15, 20, 30, 45, 60, 90, 120];
const MAX_QUESTION_TEXT = 300;
const MAX_OPTION_TEXT = 120;
const MAX_OPTIONS = 6;

function clampTimeLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return ALLOWED_TIME_LIMITS.reduce((best, t) =>
    Math.abs(t - n) < Math.abs(best - n) ? t : best
  );
}

type ValidationResult =
  | { ok: true; questions: Question[] }
  | { ok: false; error: string };

/**
 * Rebuilds each question from scratch rather than trusting the posted object —
 * the browser form enforces these rules too, but the API is what's exposed.
 */
function validateQuestions(raw: unknown): ValidationResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'Add at least one question.' };
  }
  if (raw.length > MAX_QUESTIONS) {
    return { ok: false, error: `A session can hold at most ${MAX_QUESTIONS} questions.` };
  }

  const questions: Question[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: `Question ${i + 1} is malformed.` };
    }

    const text = String(item.text ?? '').trim().slice(0, MAX_QUESTION_TEXT);
    if (!text) return { ok: false, error: `Question ${i + 1} needs some text.` };

    const type: QuestionType = item.type === 'open_text' ? 'open_text' : 'mcq';
    const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `q${i + 1}`;

    if (type === 'open_text') {
      questions.push({ id, type, text, timeLimitSeconds: clampTimeLimit(item.timeLimitSeconds) });
      continue;
    }

    const options = (Array.isArray(item.options) ? item.options : [])
      .map((o) => String(o).trim().slice(0, MAX_OPTION_TEXT))
      .filter(Boolean)
      .slice(0, MAX_OPTIONS);

    if (options.length < 2) {
      return { ok: false, error: `Question ${i + 1} needs at least 2 options.` };
    }
    if (new Set(options).size !== options.length) {
      return { ok: false, error: `Question ${i + 1} has duplicate options.` };
    }

    // An answer key that isn't one of the options can never be matched, which
    // would silently turn a quiz question into an unwinnable one.
    let correctAnswer: string | undefined;
    if (item.correctAnswer != null && String(item.correctAnswer).trim()) {
      const candidate = String(item.correctAnswer).trim().slice(0, MAX_OPTION_TEXT);
      if (!options.includes(candidate)) {
        return {
          ok: false,
          error: `Question ${i + 1}: the correct answer must be one of its options.`,
        };
      }
      correctAnswer = candidate;
    }

    questions.push({
      id,
      type,
      text,
      options,
      correctAnswer,
      timeLimitSeconds: clampTimeLimit(item.timeLimitSeconds),
    });
  }

  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) {
    questions.forEach((q, i) => { q.id = `q${i + 1}-${Date.now().toString(36)}`; });
  }

  return { ok: true, questions };
}

// ─── REST: Session management ─────────────────────────────────────────────────

/**
 * Faculty only. The host identity comes from the verified token and nothing
 * else — accepting `hostEmail` from the body would let any caller file a
 * session under another mentor's name, and that name is exactly what the
 * per-mentor report isolation is keyed on.
 */
app.post('/api/sessions', sessionCreationLimiter, requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as {
    questions?: unknown;
    topic?: string;
    subject?: string;
    batch?: string;
  };
  const result = validateQuestions(body?.questions);

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const hostEmail = req.user!.email.toLowerCase();
  const hostName = req.user!.realName || 'Faculty Mentor';

  const topic = body?.topic?.trim() || (result.questions[0]?.text ? `Quiz: ${result.questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');
  const subject = body?.subject?.trim() || 'General';
  const batch = body?.batch?.trim() || '2nd Year - Batch A';

  const session = createSession(result.questions, {
    topic,
    subject,
    batch,
    hostEmail,
    hostName,
  });

  try {
    await saveQuizSession({
      id: session.code,
      code: session.code,
      topic,
      subject,
      batch,
      hostEmail: session.hostEmail,
      hostName: session.hostName,
      questionCount: session.questions.length,
      participantCount: 0,
      questions: session.questions,
      createdAt: new Date(session.createdAt).toISOString(),
    });

    await recordAuditLog(
      session.hostEmail,
      'SESSION_CREATED',
      session.code,
      { topic, subject, batch, questionCount: session.questions.length }
    );
  } catch (err) {
    console.error('[db] Error pre-saving session to DB:', err);
  }

  console.log(`[session] created ${session.code} with ${result.questions.length} question(s) [${topic}] [${subject}] [${batch}] by ${hostEmail}`);
  res.status(201).json({
    code: session.code,
    hostId: session.hostId,
    questions: session.questions,
    topic,
    subject,
    batch,
  });
});

app.get('/api/sessions/:code', (req: Request, res: Response) => {
  const session = getSession(req.params.code);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({
    code: session.code,
    phase: session.phase,
    questionCount: session.questions.length,
    currentIndex: session.currentIndex,
    participantCount: session.participants.size,
  });
});

// ─── REST: Authentication ───────────────────────────────────────────────────

app.get('/api/auth/domains', (_req, res) => {
  res.json({
    allowedDomains: getAllowedDomains(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});

app.post('/api/auth/google', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ error: 'Missing Google credential token.' });
      return;
    }
    const result = await authenticateGoogleUser(credential);
    res.json(result);
  } catch (err) {
    console.warn('[auth] Google sign-in failed:', (err as Error).message);
    res.status(403).json({ error: (err as Error).message });
  }
});

app.post('/api/auth/demo', async (req: Request, res: Response) => {
  try {
    const { email, realName } = req.body as { email?: string; realName?: string };
    if (!email) {
      res.status(400).json({ error: 'Please provide your college email address.' });
      return;
    }
    const result = await authenticateDevDemoUser(email, realName);
    res.json(result);
  } catch (err) {
    console.warn('[auth] Demo login failed:', (err as Error).message);
    res.status(403).json({ error: (err as Error).message });
  }
});

app.post('/api/auth/otp/send', otpSendLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Please enter your college email address.' });
      return;
    }
    const result = sendCollegeOtp(email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/auth/otp/verify', async (req: Request, res: Response) => {
  try {
    const { email, code, realName } = req.body as {
      email?: string;
      code?: string;
      realName?: string;
    };
    if (!email || !code) {
      res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
      return;
    }
    const result = await verifyCollegeOtp(email, code, realName);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Re-reads the role from the database and re-issues the token. Roles change
 * out of band (an administrator approves or revokes faculty), so the claim
 * inside a 30-day token goes stale; this is how the client catches up.
 */
app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.email) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const { role, approved } = await resolveEffectiveRole(req.user.email);
    const record = await getUserByEmail(req.user.email);

    const user = {
      id: record?.id ?? req.user.id,
      email: req.user.email,
      realName: record?.realName ?? req.user.realName,
      role,
      picture: record?.picture ?? req.user.picture,
      approved,
      /** True for an unapproved campus account: faculty access is pending. */
      facultyPending: isFacultyDomain(req.user.email) && !approved,
    };

    const freshToken = generateToken({
      id: user.id,
      email: user.email,
      realName: user.realName,
      role,
      picture: user.picture,
    });

    res.json({
      user,
      token: freshToken,
    });
  } catch (err) {
    console.error('[auth] Failed to resolve current user:', err);
    res.status(503).json({ error: 'Could not load your account right now. Please try again.' });
  }
});

app.post('/api/auth/verify-mentor-pin', pinAttemptLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pin } = req.body as { pin?: string };
    if (!pin) {
      res.status(400).json({ error: 'Please enter the faculty security PIN.' });
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({ error: 'User not authenticated.' });
      return;
    }
    const result = await verifyAndPromoteMentorPin(req.user.email, pin);
    await recordAuditLog(req.user.email, 'FACULTY_SELF_PROMOTED', req.user.email, { via: 'mentor_pin' });
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

/**
 * Seeds the very first administrator, and only the first: once any admin row
 * exists the route is closed for good. This is the documented
 * `ADMIN_BOOTSTRAP_SECRET` path, and it is the only way to obtain admin rights
 * without either an existing admin row or an `ADMIN_EMAILS` entry.
 */
app.post('/api/admin/bootstrap', bootstrapLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const secret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
    if (!secret) {
      res.status(404).json({ error: 'Administrator bootstrap is not enabled on this server.' });
      return;
    }

    const { bootstrapSecret } = req.body as { bootstrapSecret?: string };
    if (!bootstrapSecret || bootstrapSecret.trim() !== secret) {
      console.warn(`[admin] Rejected bootstrap attempt by ${req.user?.email}`);
      res.status(403).json({ error: 'Invalid bootstrap secret.' });
      return;
    }

    const email = req.user?.email;
    if (!email || !isFacultyDomain(email)) {
      res.status(403).json({ error: `The first administrator must hold an @${FACULTY_DOMAIN} account.` });
      return;
    }

    if ((await countAdmins()) > 0) {
      res.status(409).json({
        error: 'An administrator already exists. Ask them to grant you access from the admin console.',
      });
      return;
    }

    const user = await setUserRole(email, 'admin');
    await setUserApproval(email, true);
    await recordAuditLog(email, 'ADMIN_BOOTSTRAPPED', email);
    console.log(`[admin] Bootstrapped first administrator: ${email}`);

    res.json({
      success: true,
      user,
      token: generateToken({
        id: user?.id ?? req.user!.id,
        email,
        realName: user?.realName ?? req.user!.realName,
        role: 'admin',
        picture: user?.picture ?? req.user!.picture,
      }),
    });
  } catch (err) {
    console.error('[admin] Bootstrap failed:', err);
    res.status(500).json({ error: 'Failed to bootstrap administrator.' });
  }
});

// ─── REST: History & Analytics ──────────────────────────────────────────────

app.get('/api/mentor/quizzes', requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // STRICT MENTOR ISOLATION:
    // Mentors can ONLY query their own quizzes.
    // Only administrators can view quizzes college-wide or filter by mentorEmail.
    const mentorEmail = req.user?.role === 'admin'
      ? (req.query.mentorEmail as string) || undefined
      : req.user?.email;

    const batch = req.query.batch as string | undefined;
    const timeRange = req.query.timeRange as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const quizzes = await getMentorQuizzes(mentorEmail, {
      batch,
      timeRange,
      startDate,
      endDate,
    });
    res.json({ quizzes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve mentor quizzes.' });
  }
});

app.get('/api/mentor/quizzes/:id', requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const details = await getQuizDetails(req.params.id);
    if (!details) {
      res.status(404).json({ error: 'Quiz session not found.' });
      return;
    }

    // STRICT MENTOR ISOLATION:
    // Non-admin mentors cannot access quiz session reports hosted by another mentor.
    if (
      req.user?.role !== 'admin' &&
      details.session.hostEmail.toLowerCase() !== req.user?.email?.toLowerCase()
    ) {
      res.status(403).json({ error: 'Access denied: You can only view quiz reports for your own sessions.' });
      return;
    }

    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve quiz details.' });
  }
});

/**
 * Per-mentor summary across every session they have hosted: the aggregate view
 * the README promises. Admins may narrow it to one mentor with `?mentorEmail=`;
 * everyone else sees only their own sessions, same rule as the list above.
 */
app.get('/api/mentor/reports', requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mentorEmail = req.user?.role === 'admin'
      ? (req.query.mentorEmail as string) || undefined
      : req.user?.email;

    const quizzes = await getMentorQuizzes(mentorEmail, {
      batch: req.query.batch as string | undefined,
      timeRange: req.query.timeRange as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    });

    const reports = [];
    for (const quiz of quizzes) {
      const details = await getQuizDetails(quiz.id);
      const participants = details?.participants ?? [];
      const responses = details?.responses ?? [];
      const graded = responses.filter((r) => r.selectedOption);

      reports.push({
        id: quiz.id,
        code: quiz.code,
        topic: quiz.topic,
        subject: quiz.subject ?? 'General',
        batch: quiz.batch ?? 'General',
        hostEmail: quiz.hostEmail,
        hostName: quiz.hostName,
        createdAt: quiz.createdAt,
        endedAt: quiz.endedAt,
        questionCount: quiz.questionCount,
        participantCount: participants.length || quiz.participantCount,
        responseCount: responses.length,
        averageScore: participants.length
          ? Math.round(participants.reduce((sum, p) => sum + p.finalScore, 0) / participants.length)
          : 0,
        accuracyPercent: graded.length
          ? Math.round((graded.filter((r) => r.isCorrect).length / graded.length) * 100)
          : 0,
        averageTimeSeconds: graded.length
          ? Math.round(graded.reduce((sum, r) => sum + (r.timeTakenMs || 0), 0) / graded.length / 100) / 10
          : 0,
        topScorer: participants[0]
          ? { realName: participants[0].realName, finalScore: participants[0].finalScore }
          : null,
      });
    }

    res.json({
      reports,
      totals: {
        sessions: reports.length,
        participants: reports.reduce((sum, r) => sum + r.participantCount, 0),
        responses: reports.reduce((sum, r) => sum + r.responseCount, 0),
        accuracyPercent: reports.length
          ? Math.round(reports.reduce((sum, r) => sum + r.accuracyPercent, 0) / reports.length)
          : 0,
      },
    });
  } catch (err) {
    console.error('[mentor] Failed to build reports:', err);
    res.status(500).json({ error: 'Failed to build mentor reports.' });
  }
});

/**
 * Gradebook download for one session. Spreadsheets treat a leading `=`, `+`,
 * `-` or `@` as a formula, and every field here is student-supplied, so those
 * are prefixed with a quote before quoting.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

app.get('/api/mentor/quizzes/:id/export.csv', requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const details = await getQuizDetails(req.params.id);
    if (!details) {
      res.status(404).json({ error: 'Quiz session not found.' });
      return;
    }

    if (
      req.user?.role !== 'admin' &&
      details.session.hostEmail.toLowerCase() !== req.user?.email?.toLowerCase()
    ) {
      res.status(403).json({ error: 'Access denied: You can only export your own sessions.' });
      return;
    }

    const { session, participants, responses } = details;
    const questions = (session.questions ?? []) as Array<{ text?: string; correctAnswer?: string }>;
    const rankByEmail = new Map(participants.map((p) => [p.email.toLowerCase(), p.rank]));

    const header = [
      'Session Code', 'Topic', 'Subject', 'Batch', 'Question #', 'Question',
      'Student Name', 'Email', 'Display Name', 'Rank', 'Answer', 'Correct Answer',
      'Is Correct', 'Score', 'Time Taken (s)', 'Answered At',
    ];

    const rows = responses.map((r) => [
      session.code,
      session.topic,
      session.subject ?? 'General',
      session.batch ?? 'General',
      r.questionIndex + 1,
      questions[r.questionIndex]?.text ?? '',
      r.realName,
      r.email,
      r.screenName,
      rankByEmail.get(r.email.toLowerCase()) ?? '',
      r.selectedOption,
      questions[r.questionIndex]?.correctAnswer ?? '',
      r.isCorrect ? 'Yes' : 'No',
      r.score,
      Math.round((r.timeTakenMs || 0) / 100) / 10,
      r.createdAt,
    ]);

    // Leading BOM so Excel reads the file as UTF-8 rather than as the local
    // code page, which mangles any non-ASCII student name.
    const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const filename = `pollmeter-${session.code}-${(session.subject ?? 'general').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;

    await recordAuditLog(req.user?.email || 'unknown', 'REPORT_EXPORTED', session.code, {
      topic: session.topic,
      rows: rows.length,
      participants: participants.length,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (err) {
    console.error('[mentor] CSV export failed:', err);
    res.status(500).json({ error: 'Failed to export the gradebook.' });
  }
});

app.get('/api/student/quizzes', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.email) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const history = await getStudentQuizzes(req.user.email);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve student quizzes.' });
  }
});

// ─── REST: University Administration (Admin Only) ───────────────────────────

app.get('/api/admin/overview', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const overview = await getUniversityOverview();
    res.json(overview);
  } catch (err) {
    console.error('[admin] Failed to fetch university overview:', err);
    res.status(500).json({ error: 'Failed to fetch university overview.' });
  }
});

app.get('/api/admin/faculty', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Includes campus accounts still awaiting approval, so the administrator
    // can see who is waiting rather than having to be told out of band.
    const faculty = await getAllFaculty(FACULTY_DOMAIN);
    res.json({ faculty });
  } catch (err) {
    console.error('[admin] Failed to fetch faculty list:', err);
    res.status(500).json({ error: 'Failed to fetch faculty list.' });
  }
});

/** Grants or withdraws the faculty role for one campus account. */
app.post('/api/admin/faculty/approve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, approved } = req.body as { email?: string; approved?: boolean };
    if (!email) {
      res.status(400).json({ error: 'Faculty email is required.' });
      return;
    }
    if (typeof approved !== 'boolean') {
      res.status(400).json({ error: 'Specify whether the account is approved.' });
      return;
    }

    const clean = email.toLowerCase().trim();
    if (!isFacultyDomain(clean)) {
      res.status(400).json({ error: `Faculty accounts must belong to the @${FACULTY_DOMAIN} domain.` });
      return;
    }
    if (clean === req.user?.email?.toLowerCase()) {
      res.status(400).json({ error: 'You cannot change your own approval state.' });
      return;
    }

    const updated = await setUserApproval(clean, approved);
    if (!updated) {
      res.status(404).json({ error: 'No account found for that email. Ask them to sign in once first.' });
      return;
    }

    await recordAuditLog(
      req.user?.email || 'admin',
      approved ? 'FACULTY_APPROVED' : 'FACULTY_REVOKED',
      clean,
      { role: updated.role }
    );
    console.log(`[admin] Faculty ${clean} ${approved ? 'approved' : 'revoked'} by ${req.user?.email}`);

    res.json({ success: true, faculty: updated });
  } catch (err) {
    console.error('[admin] Failed to change faculty approval:', err);
    res.status(500).json({ error: 'Failed to update faculty approval.' });
  }
});

app.post('/api/admin/faculty', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, realName, department, subject, batches, role } = req.body as {
      email?: string;
      realName?: string;
      department?: string;
      subject?: string;
      batches?: string[];
      role?: 'mentor' | 'admin';
    };

    if (!email || !realName) {
      res.status(400).json({ error: 'Faculty email and full name are required.' });
      return;
    }

    if (!email.toLowerCase().trim().endsWith(`@${FACULTY_DOMAIN}`)) {
      res.status(400).json({ error: `Faculty and admin email must belong to the @${FACULTY_DOMAIN} domain.` });
      return;
    }

    const faculty = await addOrUpdateFaculty({
      email,
      realName,
      department,
      subject,
      batches,
      role: role || 'mentor',
    });
    console.log(`[admin] Faculty ${email} added/updated by ${req.user?.email}`);

    await recordAuditLog(
      req.user?.email || 'admin',
      'FACULTY_ASSIGNED',
      email,
      { realName, department, subject, batches, role: role || 'mentor' }
    );

    res.json({ success: true, faculty });
  } catch (err) {
    console.error('[admin] Failed to add/update faculty:', err);
    res.status(500).json({ error: 'Failed to save faculty record.' });
  }
});

app.get('/api/batches', (_req: Request, res: Response) => {
  res.json({ batches: STANDARD_BATCHES });
});

app.delete('/api/admin/faculty/:email', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.params;
    if (!email) {
      res.status(400).json({ error: 'Faculty email is required.' });
      return;
    }
    const success = await removeFaculty(email);
    console.log(`[admin] Faculty ${email} removed/demoted by ${req.user?.email}`);

    await recordAuditLog(
      req.user?.email || 'admin',
      'FACULTY_REVOKED',
      email
    );

    res.json({ success });
  } catch (err) {
    console.error('[admin] Failed to remove faculty:', err);
    res.status(500).json({ error: 'Failed to remove faculty member.' });
  }
});

app.get('/api/admin/students', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const students = await searchStudents(q);
    res.json({ students });
  } catch (err) {
    console.error('[admin] Failed to search students:', err);
    res.status(500).json({ error: 'Failed to search student audit data.' });
  }
});

app.post('/api/audit/log', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, targetId, metadata } = req.body;
    if (!action) {
      res.status(400).json({ error: 'Action is required.' });
      return;
    }
    await recordAuditLog(req.user?.email || 'unknown', action, targetId, metadata);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record audit log.' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await getRecentAuditLogs(100);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// ─── REST: AI question generation ─────────────────────────────────────────────

app.post('/api/ai/generate-questions', aiGenerationLimiter, handleGenerateQuestions);
app.get('/api/ai/status', (_req, res) => res.json(getAiStatus()));

// ─── REST: Network info for the join QR ───────────────────────────────────────

interface Candidate { address: string; iface: string; score: number; }

/**
 * Laptops routinely carry VirtualBox / WSL / Hyper-V adapters whose addresses
 * no phone can reach. Rank real wifi and ethernet first so the projected QR
 * code actually resolves for the class.
 */
function scoreInterface(name: string, address: string): number {
  const n = name.toLowerCase();
  let score = 0;

  if (/^192\.168\./.test(address)) score += 40;
  else if (/^10\./.test(address)) score += 30;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 20;

  if (/wi-?fi|wlan|wireless|en0|wlp/.test(n)) score += 25;
  else if (/ethernet|eth\d|enp|lan/.test(n)) score += 20;

  if (/virtualbox|vbox|vmware|hyper-v|vethernet|docker|wsl|loopback|tailscale|zerotier|tunnel|vpn/.test(n)) {
    score -= 100;
  }
  if (/^192\.168\.56\./.test(address)) score -= 60;   // VirtualBox host-only default
  if (/^169\.254\./.test(address)) score -= 100;      // link-local, unroutable

  return score;
}

function listLanCandidates(): Candidate[] {
  const nets = os.networkInterfaces();
  const candidates: Candidate[] = [];

  for (const [name, addrs] of Object.entries(nets)) {
    for (const net of addrs ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      candidates.push({ address: net.address, iface: name, score: scoreInterface(name, net.address) });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

app.get('/api/network-info', (_req, res) => {
  const candidates = listLanCandidates();
  const best = candidates.find((c) => c.score > 0) ?? candidates[0];

  res.json({
    localIp: best?.address ?? 'localhost',
    port: PORT,
    candidates: candidates.map(({ address, iface }) => ({ address, iface })),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: sessionCount(), uptimeSeconds: Math.round(process.uptime()) });
});

// Unknown API routes must 404 as JSON, not fall through to the SPA shell.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

// ─── Static client (production) ───────────────────────────────────────────────

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[http]', err.message);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)), methods: ['GET', 'POST'] },
  pingTimeout: 25000,
  pingInterval: 20000,
});

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

startSessionSweeper();

initDb().catch((err) => {
  console.error('[db] Initialization error:', err);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const ai = getAiStatus();
  const best = listLanCandidates().find((c) => c.score > 0);

  console.log(`\n  PollMeter server running`);
  console.log(`  Local     http://localhost:${PORT}`);
  if (best) console.log(`  Network   http://${best.address}:${PORT}   (${best.iface})`);
  console.log(
    `  AI        ${ai.enabled ? `live — ${ai.model}` : 'no API key — using the built-in question bank'}\n`
  );
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

/**
 * On a deploy or a Ctrl-C, close down in the order that loses the least: stop
 * accepting new HTTP connections, tell every connected client the server is
 * going away, then drain the database pool.
 *
 * Disconnecting sockets explicitly matters more here than it usually would.
 * A classroom full of phones that is merely dropped will each hit the
 * reconnect backoff and stampede the replacement process at the same instant;
 * a clean `io.close()` sends a disconnect frame so the client reconnects on its
 * own schedule instead. Live sessions are in memory and do not survive either
 * way — that is what the RFC's persistence work is for — but the mentor sees a
 * "reconnecting" state rather than a frozen screen.
 *
 * The 10s timer is the backstop: if a socket refuses to close or the pool hangs
 * on a stuck query, exit anyway rather than let the platform SIGKILL us at an
 * arbitrary point.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  // A second Ctrl-C should kill immediately — someone pressing it twice has
  // decided they are done waiting.
  if (shuttingDown) {
    console.log(`\n[shutdown] ${signal} received again — exiting now.`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received — closing down.`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] Timed out after 10s — forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref?.();

  try {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    console.log('[shutdown] HTTP server closed.');

    await new Promise<void>((resolve) => io.close(() => resolve()));
    console.log('[shutdown] Socket.io closed.');

    await closePool();
  } catch (err) {
    console.error('[shutdown] Error while closing down:', (err as Error).message);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app, io };
