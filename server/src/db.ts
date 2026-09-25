import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  email: string;
  realName: string;
  role: 'student' | 'mentor' | 'admin';
  collegeDomain: string;
  department?: string;
  subject?: string;
  batches?: string[];
  picture?: string;
  createdAt: string;
}

export const STANDARD_BATCHES = [
  '1st Year - Batch A',
  '1st Year - Batch B',
  '1st Year - Batch C',
  '2nd Year - Batch A',
  '2nd Year - Batch B',
  '2nd Year - Batch C',
  '3rd Year - Batch A',
];

export interface QuizSessionRecord {
  id: string;
  code: string;
  topic: string;
  subject?: string;
  batch?: string;
  hostEmail: string;
  hostName?: string;
  questionCount: number;
  participantCount: number;
  questions?: unknown[];
  createdAt: string;
  endedAt?: string;
}

export interface SessionParticipantRecord {
  id: string;
  sessionId: string;
  userId?: string;
  realName: string;
  email: string;
  screenName: string;
  batch?: string;
  finalScore: number;
  correctCount: number;
  totalQuestions: number;
  rank: number;
  joinedAt: string;
}

export interface StudentResponseRecord {
  id: string;
  sessionId: string;
  questionIndex: number;
  userId?: string;
  email: string;
  realName: string;
  screenName: string;
  selectedOption: string;
  isCorrect: boolean;
  score: number;
  timeTakenMs: number;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string;
  action: string;
  targetId?: string;
  metadata?: unknown;
  createdAt: string;
}

interface LocalSchema {
  users: Record<string, User>;
  sessions: Record<string, QuizSessionRecord>;
  participants: SessionParticipantRecord[];
  responses: StudentResponseRecord[];
  auditLogs?: AuditLogRecord[];
}

let pool: Pool | null = null;
let usePostgres = false;
const DATA_DIR = path.resolve(__dirname, '../data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'pollmeter_db.json');

let localDb: LocalSchema = {
  users: {},
  sessions: {},
  participants: [],
  responses: [],
};

function loadLocalDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      localDb = JSON.parse(raw);
    } else {
      saveLocalDb();
    }
  } catch (err) {
    console.warn('[db] Failed to load local file db, initializing fresh:', (err as Error).message);
    localDb = { users: {}, sessions: {}, participants: [], responses: [] };
  }
}

function saveLocalDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${LOCAL_DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(localDb, null, 2), 'utf-8');
    fs.renameSync(tempFile, LOCAL_DB_FILE);
  } catch (err) {
    console.error('[db] Error persisting local db:', (err as Error).message);
  }
}

export async function initDb(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL?.trim();

  if (dbUrl) {
    try {
      pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(160) UNIQUE NOT NULL,
            real_name VARCHAR(160) NOT NULL,
            role VARCHAR(20) DEFAULT 'student',
            college_domain VARCHAR(120) NOT NULL,
            picture TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(160);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS subject VARCHAR(160);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS batches JSONB DEFAULT '[]';

          CREATE TABLE IF NOT EXISTS quiz_sessions (
            id VARCHAR(64) PRIMARY KEY,
            code VARCHAR(20) NOT NULL,
            topic VARCHAR(255) NOT NULL,
            subject VARCHAR(160) DEFAULT 'General',
            batch VARCHAR(100) DEFAULT 'General',
            host_email VARCHAR(160) NOT NULL,
            host_name VARCHAR(160),
            question_count INT DEFAULT 0,
            participant_count INT DEFAULT 0,
            questions JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP WITH TIME ZONE
          );

          ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS subject VARCHAR(160) DEFAULT 'General';
          ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS batch VARCHAR(100) DEFAULT 'General';

          CREATE TABLE IF NOT EXISTS session_participants (
            id VARCHAR(64) PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            user_id VARCHAR(64),
            real_name VARCHAR(160) NOT NULL,
            email VARCHAR(160) NOT NULL,
            screen_name VARCHAR(100) NOT NULL,
            batch VARCHAR(100) DEFAULT 'General',
            final_score INT DEFAULT 0,
            correct_count INT DEFAULT 0,
            total_questions INT DEFAULT 0,
            rank INT DEFAULT 0,
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS student_responses (
            id VARCHAR(64) PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            question_index INT NOT NULL,
            user_id VARCHAR(64),
            email VARCHAR(160) NOT NULL,
            real_name VARCHAR(160) NOT NULL,
            screen_name VARCHAR(100) NOT NULL,
            selected_option TEXT,
            is_correct BOOLEAN DEFAULT false,
            score INT DEFAULT 0,
            time_taken_ms INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(64) PRIMARY KEY,
            actor_id VARCHAR(160) NOT NULL,
            action VARCHAR(100) NOT NULL,
            target_id VARCHAR(160),
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        usePostgres = true;
        console.log('[db] Connected to PostgreSQL database successfully.');
      } finally {
        client.release();
      }
      return;
    } catch (err) {
      console.warn('[db] PostgreSQL connection failed, falling back to local persistent store:', (err as Error).message);
      usePostgres = false;
      pool = null;
    }
  }

  // Local fallback
  loadLocalDb();
  console.log(`[db] Using local persistent JSON store at: ${LOCAL_DB_FILE}`);
}

export async function upsertUser(user: User): Promise<User> {
  if (usePostgres && pool) {
    const res = await pool.query(
      `INSERT INTO users (id, email, real_name, role, college_domain, department, subject, picture, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO UPDATE
       SET real_name = EXCLUDED.real_name,
           picture = EXCLUDED.picture,
           college_domain = EXCLUDED.college_domain,
           department = COALESCE(EXCLUDED.department, users.department),
           subject = COALESCE(EXCLUDED.subject, users.subject),
           role = CASE WHEN users.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END
       RETURNING id, email, real_name as "realName", role, college_domain as "collegeDomain", department, subject, picture, created_at as "createdAt"`,
      [
        user.id,
        user.email.toLowerCase(),
        user.realName,
        user.role,
        user.collegeDomain,
        user.department ?? null,
        user.subject ?? null,
        user.picture ?? null,
        user.createdAt,
      ]
    );
    return res.rows[0];
  }

  const existing = Object.values(localDb.users).find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  if (existing) {
    existing.realName = user.realName;
    existing.picture = user.picture ?? existing.picture;
    existing.collegeDomain = user.collegeDomain;
    existing.department = user.department ?? existing.department;
    existing.subject = user.subject ?? existing.subject;
    saveLocalDb();
    return existing;
  }

  localDb.users[user.id] = { ...user, email: user.email.toLowerCase() };
  saveLocalDb();
  return localDb.users[user.id];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.toLowerCase().trim();
  if (usePostgres && pool) {
    const res = await pool.query(
      `SELECT id, email, real_name as "realName", role, college_domain as "collegeDomain", department, subject, picture, created_at as "createdAt"
       FROM users WHERE LOWER(email) = $1`,
      [cleanEmail]
    );
    return res.rows[0] ?? null;
  }

  const found = Object.values(localDb.users).find((u) => u.email.toLowerCase() === cleanEmail);
  return found ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  if (usePostgres && pool) {
    const res = await pool.query(
      `SELECT id, email, real_name as "realName", role, college_domain as "collegeDomain", department, subject, picture, created_at as "createdAt"
       FROM users WHERE id = $1`,
      [id]
    );
    return res.rows[0] ?? null;
  }

  return localDb.users[id] ?? null;
}

export async function setUserRole(email: string, role: 'mentor' | 'student' | 'admin'): Promise<User | null> {
  const cleanEmail = email.toLowerCase().trim();
  if (usePostgres && pool) {
    const res = await pool.query(
      `UPDATE users SET role = $1 WHERE LOWER(email) = $2
       RETURNING id, email, real_name as "realName", role, college_domain as "collegeDomain", department, subject, picture, created_at as "createdAt"`,
      [role, cleanEmail]
    );
    return res.rows[0] ?? null;
  }

  const found = Object.values(localDb.users).find((u) => u.email.toLowerCase() === cleanEmail);
  if (found) {
    found.role = role;
    saveLocalDb();
    return found;
  }
  return null;
}

export async function saveQuizSession(session: QuizSessionRecord): Promise<void> {
  if (usePostgres && pool) {
    await pool.query(
      `INSERT INTO quiz_sessions (id, code, topic, subject, batch, host_email, host_name, question_count, participant_count, questions, created_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE
       SET participant_count = EXCLUDED.participant_count,
           ended_at = EXCLUDED.ended_at,
           subject = COALESCE(EXCLUDED.subject, quiz_sessions.subject),
           batch = COALESCE(EXCLUDED.batch, quiz_sessions.batch)`,
      [
        session.id,
        session.code,
        session.topic,
        session.subject || 'General',
        session.batch || 'General',
        session.hostEmail.toLowerCase(),
        session.hostName ?? null,
        session.questionCount,
        session.participantCount,
        JSON.stringify(session.questions ?? []),
        session.createdAt,
        session.endedAt ?? null,
      ]
    );
    return;
  }

  localDb.sessions[session.id] = { ...session, hostEmail: session.hostEmail.toLowerCase() };
  saveLocalDb();
}

export async function saveSessionResults(
  sessionId: string,
  participants: SessionParticipantRecord[],
  responses: StudentResponseRecord[]
): Promise<void> {
  if (usePostgres && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update session participant count & ended_at
      await client.query(
        `UPDATE quiz_sessions
         SET participant_count = $1, ended_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [participants.length, sessionId]
      );

      // Upsert participants
      for (const p of participants) {
        await client.query(
          `INSERT INTO session_participants (id, session_id, user_id, real_name, email, screen_name, batch, final_score, correct_count, total_questions, rank, joined_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE
           SET final_score = EXCLUDED.final_score,
               correct_count = EXCLUDED.correct_count,
               rank = EXCLUDED.rank,
               batch = COALESCE(EXCLUDED.batch, session_participants.batch)`,
          [
            p.id || uuidv4(),
            sessionId,
            p.userId ?? null,
            p.realName,
            p.email.toLowerCase(),
            p.screenName,
            p.batch || 'General',
            p.finalScore,
            p.correctCount,
            p.totalQuestions,
            p.rank,
            p.joinedAt || new Date().toISOString(),
          ]
        );
      }

      // Insert responses
      for (const r of responses) {
        await client.query(
          `INSERT INTO student_responses (id, session_id, question_index, user_id, email, real_name, screen_name, selected_option, is_correct, score, time_taken_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            r.id || uuidv4(),
            sessionId,
            r.questionIndex,
            r.userId ?? null,
            r.email.toLowerCase(),
            r.realName,
            r.screenName,
            r.selectedOption,
            r.isCorrect,
            r.score,
            r.timeTakenMs,
            r.createdAt || new Date().toISOString(),
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[db] Error saving session results to postgres:', err);
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // Local fallback
  if (localDb.sessions[sessionId]) {
    localDb.sessions[sessionId].participantCount = participants.length;
    localDb.sessions[sessionId].endedAt = new Date().toISOString();
  }

  // Remove previous participants and responses for this session if re-saved
  localDb.participants = localDb.participants.filter((p) => p.sessionId !== sessionId);
  localDb.participants.push(...participants);

  localDb.responses = localDb.responses.filter((r) => r.sessionId !== sessionId);
  localDb.responses.push(...responses);

  saveLocalDb();
}

export interface QuizFilterOptions {
  batch?: string;
  timeRange?: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom' | string;
  startDate?: string;
  endDate?: string;
}

function matchesDateRange(createdAt: string, timeRange?: string, startDate?: string, endDate?: string): boolean {
  if (!timeRange || timeRange === 'all') return true;
  const d = new Date(createdAt);
  const now = new Date();

  if (timeRange === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (timeRange === 'yesterday') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return d.toDateString() === y.toDateString();
  }
  if (timeRange === '7d') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= cutoff;
  }
  if (timeRange === '30d') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return d >= cutoff;
  }
  if (timeRange === 'custom') {
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(endDate + 'T23:59:59.999Z')) return false;
    return true;
  }
  return true;
}

export async function getMentorQuizzes(
  hostEmail?: string,
  options?: QuizFilterOptions
): Promise<QuizSessionRecord[]> {
  if (usePostgres && pool) {
    let query = `
      SELECT id, code, topic, COALESCE(subject, 'General') as subject, COALESCE(batch, 'General') as batch,
             host_email as "hostEmail", host_name as "hostName", question_count as "questionCount",
             participant_count as "participantCount", questions, created_at as "createdAt", ended_at as "endedAt"
      FROM quiz_sessions
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (hostEmail) {
      params.push(hostEmail.toLowerCase().trim());
      query += ` AND LOWER(host_email) = $${params.length}`;
    }
    if (options?.batch && options.batch !== 'all') {
      params.push(options.batch);
      query += ` AND batch = $${params.length}`;
    }
    if (options?.timeRange === 'today') {
      query += ` AND created_at >= CURRENT_DATE`;
    } else if (options?.timeRange === 'yesterday') {
      query += ` AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE`;
    } else if (options?.timeRange === '7d') {
      query += ` AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`;
    } else if (options?.timeRange === '30d') {
      query += ` AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'`;
    } else if (options?.timeRange === 'custom') {
      if (options.startDate) {
        params.push(options.startDate);
        query += ` AND created_at >= $${params.length}`;
      }
      if (options.endDate) {
        params.push(options.endDate + 'T23:59:59.999Z');
        query += ` AND created_at <= $${params.length}`;
      }
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;

    const res = await pool.query(query, params);
    return res.rows;
  }

  const all = Object.values(localDb.sessions);
  let filtered = all;
  if (hostEmail) {
    filtered = filtered.filter((s) => s.hostEmail.toLowerCase() === hostEmail.toLowerCase().trim());
  }
  if (options?.batch && options.batch !== 'all') {
    filtered = filtered.filter((s) => (s.batch || 'General') === options.batch);
  }
  if (options?.timeRange && options.timeRange !== 'all') {
    filtered = filtered.filter((s) => matchesDateRange(s.createdAt, options.timeRange, options.startDate, options.endDate));
  }

  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getQuizDetails(sessionId: string): Promise<{
  session: QuizSessionRecord;
  participants: SessionParticipantRecord[];
  responses: StudentResponseRecord[];
} | null> {
  if (usePostgres && pool) {
    const sRes = await pool.query(
      `SELECT id, code, topic, COALESCE(subject, 'General') as subject, COALESCE(batch, 'General') as batch,
              host_email as "hostEmail", host_name as "hostName",
              question_count as "questionCount", participant_count as "participantCount",
              questions, created_at as "createdAt", ended_at as "endedAt"
       FROM quiz_sessions WHERE id = $1`,
      [sessionId]
    );
    if (!sRes.rows[0]) return null;

    const pRes = await pool.query(
      `SELECT id, session_id as "sessionId", user_id as "userId", real_name as "realName",
              email, screen_name as "screenName", COALESCE(batch, 'General') as batch,
              final_score as "finalScore", correct_count as "correctCount",
              total_questions as "totalQuestions", rank, joined_at as "joinedAt"
       FROM session_participants WHERE session_id = $1 ORDER BY rank ASC, final_score DESC`,
      [sessionId]
    );

    const rRes = await pool.query(
      `SELECT id, session_id as "sessionId", question_index as "questionIndex", user_id as "userId",
              email, real_name as "realName", screen_name as "screenName",
              selected_option as "selectedOption", is_correct as "isCorrect",
              score, time_taken_ms as "timeTakenMs", created_at as "createdAt"
       FROM student_responses WHERE session_id = $1 ORDER BY question_index ASC`,
      [sessionId]
    );

    return {
      session: sRes.rows[0],
      participants: pRes.rows,
      responses: rRes.rows,
    };
  }

  const session = localDb.sessions[sessionId];
  if (!session) return null;

  const participants = localDb.participants
    .filter((p) => p.sessionId === sessionId)
    .sort((a, b) => a.rank - b.rank || b.finalScore - a.finalScore);

  const responses = localDb.responses
    .filter((r) => r.sessionId === sessionId)
    .sort((a, b) => a.questionIndex - b.questionIndex);

  return { session, participants, responses };
}

export async function getStudentQuizzes(studentEmail: string): Promise<Array<{
  session: QuizSessionRecord;
  participant: SessionParticipantRecord;
}>> {
  const cleanEmail = studentEmail.toLowerCase().trim();

  if (usePostgres && pool) {
    const res = await pool.query(
      `SELECT s.id as s_id, s.code, s.topic, COALESCE(s.subject, 'General') as s_subject,
              COALESCE(s.batch, 'General') as s_batch, s.host_email as s_host_email, s.host_name as s_host_name,
              s.question_count, s.participant_count, s.created_at as s_created_at, s.ended_at as s_ended_at,
              p.id as p_id, p.user_id, p.real_name, p.email, p.screen_name, COALESCE(p.batch, 'General') as p_batch,
              p.final_score, p.correct_count, p.total_questions, p.rank, p.joined_at
       FROM session_participants p
       JOIN quiz_sessions s ON p.session_id = s.id
       WHERE LOWER(p.email) = $1
       ORDER BY s.created_at DESC LIMIT 50`,
      [cleanEmail]
    );

    return res.rows.map((row) => ({
      session: {
        id: row.s_id,
        code: row.code,
        topic: row.topic,
        subject: row.s_subject,
        batch: row.s_batch,
        hostEmail: row.s_host_email,
        hostName: row.s_host_name,
        questionCount: row.question_count,
        participantCount: row.participant_count,
        createdAt: row.s_created_at,
        endedAt: row.s_ended_at,
      },
      participant: {
        id: row.p_id,
        sessionId: row.s_id,
        userId: row.user_id,
        realName: row.real_name,
        email: row.email,
        screenName: row.screen_name,
        batch: row.p_batch,
        finalScore: row.final_score,
        correctCount: row.correct_count,
        totalQuestions: row.total_questions,
        rank: row.rank,
        joinedAt: row.joined_at,
      },
    }));
  }

  const pList = localDb.participants.filter((p) => p.email.toLowerCase() === cleanEmail);
  const out: Array<{ session: QuizSessionRecord; participant: SessionParticipantRecord }> = [];

  for (const p of pList) {
    const s = localDb.sessions[p.sessionId];
    if (s) {
      out.push({ session: s, participant: p });
    }
  }

  return out.sort((a, b) => new Date(b.session.createdAt).getTime() - new Date(a.session.createdAt).getTime());
}

// ─── Admin & University Management ──────────────────────────────────────────

export async function getAllFaculty(): Promise<User[]> {
  if (usePostgres && pool) {
    const res = await pool.query(
      `SELECT id, email, real_name as "realName", role, college_domain as "collegeDomain",
              department, subject, COALESCE(batches, '[]'::jsonb) as batches, picture, created_at as "createdAt"
       FROM users
       WHERE role IN ('mentor', 'admin')
       ORDER BY real_name ASC`
    );
    return res.rows;
  }

  return Object.values(localDb.users)
    .filter((u) => u.role === 'mentor' || u.role === 'admin')
    .sort((a, b) => a.realName.localeCompare(b.realName));
}

export async function addOrUpdateFaculty(data: {
  email: string;
  realName: string;
  department?: string;
  subject?: string;
  batches?: string[];
  role?: 'mentor' | 'admin';
}): Promise<User> {
  const cleanEmail = data.email.toLowerCase().trim();
  const collegeDomain = cleanEmail.split('@')[1] || 'medhaviskillsuniversity.edu.in';
  const role = data.role || 'mentor';
  const batches = data.batches ?? [];

  if (usePostgres && pool) {
    const res = await pool.query(
      `INSERT INTO users (id, email, real_name, role, college_domain, department, subject, batches, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE
       SET real_name = EXCLUDED.real_name,
           role = CASE WHEN users.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
           department = COALESCE(EXCLUDED.department, users.department),
           subject = COALESCE(EXCLUDED.subject, users.subject),
           batches = COALESCE(EXCLUDED.batches, users.batches)
       RETURNING id, email, real_name as "realName", role, college_domain as "collegeDomain", department, subject, batches, picture, created_at as "createdAt"`,
      [uuidv4(), cleanEmail, data.realName, role, collegeDomain, data.department ?? null, data.subject ?? null, JSON.stringify(batches)]
    );
    return res.rows[0];
  }

  const existing = Object.values(localDb.users).find((u) => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    existing.realName = data.realName;
    if (existing.role !== 'admin') existing.role = role;
    existing.department = data.department ?? existing.department;
    existing.subject = data.subject ?? existing.subject;
    existing.batches = batches.length > 0 ? batches : existing.batches;
    saveLocalDb();
    return existing;
  }

  const newUser: User = {
    id: uuidv4(),
    email: cleanEmail,
    realName: data.realName,
    role,
    collegeDomain,
    department: data.department,
    subject: data.subject,
    batches,
    createdAt: new Date().toISOString(),
  };
  localDb.users[newUser.id] = newUser;
  saveLocalDb();
  return newUser;
}

export async function removeFaculty(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (usePostgres && pool) {
    const res = await pool.query(
      `UPDATE users SET role = 'student' WHERE LOWER(email) = $1 AND role != 'admin' RETURNING id`,
      [cleanEmail]
    );
    return (res.rowCount ?? 0) > 0;
  }

  const user = Object.values(localDb.users).find((u) => u.email.toLowerCase() === cleanEmail);
  if (user && user.role !== 'admin') {
    user.role = 'student';
    saveLocalDb();
    return true;
  }
  return false;
}

export async function getUniversityOverview(): Promise<{
  totalMentors: number;
  totalStudents: number;
  totalQuizzes: number;
  totalResponses: number;
  subjects: Array<{ subject: string; count: number }>;
  batches: Array<{ batch: string; count: number }>;
  recentQuizzes: QuizSessionRecord[];
}> {
  if (usePostgres && pool) {
    const mentorRes = await pool.query(`SELECT COUNT(*)::int as count FROM users WHERE role IN ('mentor', 'admin')`);
    const studentRes = await pool.query(`SELECT COUNT(*)::int as count FROM users WHERE role = 'student'`);
    const quizRes = await pool.query(`SELECT COUNT(*)::int as count FROM quiz_sessions`);
    const respRes = await pool.query(`SELECT COUNT(*)::int as count FROM student_responses`);
    const subjectRes = await pool.query(`
      SELECT COALESCE(subject, 'General') as subject, COUNT(*)::int as count
      FROM quiz_sessions
      GROUP BY COALESCE(subject, 'General')
      ORDER BY count DESC
    `);
    const batchRes = await pool.query(`
      SELECT COALESCE(batch, 'General') as batch, COUNT(*)::int as count
      FROM quiz_sessions
      GROUP BY COALESCE(batch, 'General')
      ORDER BY count DESC
    `);
    const recentRes = await pool.query(`
      SELECT id, code, topic, COALESCE(subject, 'General') as subject, COALESCE(batch, 'General') as batch,
             host_email as "hostEmail", host_name as "hostName",
             question_count as "questionCount", participant_count as "participantCount", created_at as "createdAt", ended_at as "endedAt"
      FROM quiz_sessions
      ORDER BY created_at DESC
      LIMIT 15
    `);

    return {
      totalMentors: mentorRes.rows[0]?.count ?? 0,
      totalStudents: studentRes.rows[0]?.count ?? 0,
      totalQuizzes: quizRes.rows[0]?.count ?? 0,
      totalResponses: respRes.rows[0]?.count ?? 0,
      subjects: subjectRes.rows,
      batches: batchRes.rows,
      recentQuizzes: recentRes.rows,
    };
  }

  const allUsers = Object.values(localDb.users);
  const totalMentors = allUsers.filter((u) => u.role === 'mentor' || u.role === 'admin').length;
  const totalStudents = allUsers.filter((u) => u.role === 'student').length;
  const allSessions = Object.values(localDb.sessions);
  const totalQuizzes = allSessions.length;
  const totalResponses = localDb.responses.length;

  const subjectCounts: Record<string, number> = {};
  const batchCounts: Record<string, number> = {};
  for (const s of allSessions) {
    const sub = s.subject || 'General';
    subjectCounts[sub] = (subjectCounts[sub] || 0) + 1;
    const b = s.batch || 'General';
    batchCounts[b] = (batchCounts[b] || 0) + 1;
  }
  const subjects = Object.entries(subjectCounts).map(([subject, count]) => ({ subject, count }));
  const batches = Object.entries(batchCounts).map(([batch, count]) => ({ batch, count }));

  const recentQuizzes = [...allSessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 15);

  return {
    totalMentors,
    totalStudents,
    totalQuizzes,
    totalResponses,
    subjects,
    batches,
    recentQuizzes,
  };
}

export async function searchStudents(query?: string): Promise<Array<{
  email: string;
  realName: string;
  quizCount: number;
  avgScore: number;
  lastQuizDate?: string;
}>> {
  const cleanQ = query?.toLowerCase().trim() ?? '';

  if (usePostgres && pool) {
    const res = await pool.query(`
      SELECT p.email, p.real_name as "realName",
             COUNT(DISTINCT p.session_id)::int as "quizCount",
             ROUND(AVG(p.final_score))::int as "avgScore",
             MAX(p.joined_at) as "lastQuizDate"
      FROM session_participants p
      WHERE ($1 = '' OR LOWER(p.email) LIKE '%' || $1 || '%' OR LOWER(p.real_name) LIKE '%' || $1 || '%')
      GROUP BY p.email, p.real_name
      ORDER BY "quizCount" DESC, "avgScore" DESC
      LIMIT 100
    `, [cleanQ]);
    return res.rows;
  }

  const studentMap = new Map<string, { email: string; realName: string; scores: number[]; lastDate: string }>();
  for (const p of localDb.participants) {
    if (cleanQ && !p.email.toLowerCase().includes(cleanQ) && !p.realName.toLowerCase().includes(cleanQ)) {
      continue;
    }
    const existing = studentMap.get(p.email.toLowerCase()) || {
      email: p.email.toLowerCase(),
      realName: p.realName,
      scores: [],
      lastDate: p.joinedAt,
    };
    existing.scores.push(p.finalScore);
    if (new Date(p.joinedAt).getTime() > new Date(existing.lastDate).getTime()) {
      existing.lastDate = p.joinedAt;
    }
    studentMap.set(p.email.toLowerCase(), existing);
  }

  return Array.from(studentMap.values()).map((s) => ({
    email: s.email,
    realName: s.realName,
    quizCount: s.scores.length,
    avgScore: Math.round(s.scores.reduce((a, b) => a + b, 0) / (s.scores.length || 1)),
    lastQuizDate: s.lastDate,
  })).sort((a, b) => b.quizCount - a.quizCount);
}

export async function recordAuditLog(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: unknown
): Promise<void> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  if (usePostgres && pool) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, actor_id, action, target_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, actorId, action, targetId || null, metadata ? JSON.stringify(metadata) : null, createdAt]
      );
      return;
    } catch (err) {
      console.error('[db] Error inserting audit log into postgres:', (err as Error).message);
    }
  }

  if (!localDb.auditLogs) localDb.auditLogs = [];
  localDb.auditLogs.push({ id, actorId, action, targetId, metadata, createdAt });
  saveLocalDb();
}

export async function getRecentAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
  if (usePostgres && pool) {
    try {
      const res = await pool.query(
        `SELECT id, actor_id as "actorId", action, target_id as "targetId", metadata, created_at as "createdAt"
         FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    } catch (err) {
      console.error('[db] Error fetching audit logs from postgres:', (err as Error).message);
    }
  }

  return (localDb.auditLogs || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

