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
} from './db';
import {
  getAllowedDomains,
  authenticateGoogleUser,
  authenticateDevDemoUser,
  verifyAndPromoteMentorPin,
  requireAuth,
  requireMentor,
  AuthenticatedRequest,
  verifyToken,
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
  methods: ['GET', 'POST'],
};

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', true);
app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

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

app.post('/api/sessions', sessionCreationLimiter, async (req: Request, res: Response) => {
  const body = req.body as {
    questions?: unknown;
    topic?: string;
    hostEmail?: string;
    hostName?: string;
  };
  const result = validateQuestions(body?.questions);

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  let hostEmail = body?.hostEmail;
  let hostName = body?.hostName;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const decoded = verifyToken(authHeader.substring(7));
    if (decoded) {
      hostEmail = hostEmail || decoded.email;
      hostName = hostName || decoded.realName;
    }
  }

  const topic = body?.topic?.trim() || (result.questions[0]?.text ? `Quiz: ${result.questions[0].text.slice(0, 40)}...` : 'Classroom Quiz');

  const session = createSession(result.questions, {
    topic,
    hostEmail: hostEmail || 'mentor@medhaviskillsuniversity.edu.in',
    hostName: hostName || 'Faculty Mentor',
  });

  try {
    await saveQuizSession({
      id: session.code,
      code: session.code,
      topic,
      hostEmail: session.hostEmail || 'mentor@medhaviskillsuniversity.edu.in',
      hostName: session.hostName,
      questionCount: session.questions.length,
      participantCount: 0,
      questions: session.questions,
      createdAt: new Date(session.createdAt).toISOString(),
    });
  } catch (err) {
    console.error('[db] Error pre-saving session to DB:', err);
  }

  console.log(`[session] created ${session.code} with ${result.questions.length} question(s) [${topic}]`);
  res.status(201).json({
    code: session.code,
    hostId: session.hostId,
    questions: session.questions,
    topic,
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

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

app.post('/api/auth/verify-mentor-pin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

// ─── REST: History & Analytics ──────────────────────────────────────────────

app.get('/api/mentor/quizzes', requireMentor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mentorEmail = req.user?.role === 'admin' ? undefined : req.user?.email;
    const quizzes = await getMentorQuizzes(mentorEmail);
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
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve quiz details.' });
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

export { app, io };
