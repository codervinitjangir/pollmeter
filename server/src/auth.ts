import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User, getUserByEmail, upsertUser, setUserApproval } from './db';
import { v4 as uuidv4 } from 'uuid';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * A secret that must never fall back to a value committed to the repository.
 * In production an unset variable is a deployment fault, so fail at import
 * time — a server running on a public default secret is worse than one that
 * refuses to boot, because every token it issues can be forged.
 */
function requiredSecret(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (IS_PRODUCTION) {
    throw new Error(
      `[config] ${name} is not set. Refusing to start in production with a default secret — ` +
        `set ${name} in the environment.`
    );
  }
  console.warn(
    `[config] ${name} is not set — falling back to an insecure development value. Do not deploy this.`
  );
  return devFallback;
}

const JWT_SECRET = requiredSecret('JWT_SECRET', 'pollmeter_dev_only_insecure_secret');

/** The one domain that can ever hold faculty or admin rights. */
export const FACULTY_DOMAIN = (process.env.FACULTY_DOMAIN || 'polariscampus.com').toLowerCase().trim();

const DEFAULT_DOMAINS = [FACULTY_DOMAIN, 'medhaviskillsuniversity.edu.in'];

export interface JwtPayload {
  id: string;
  email: string;
  realName: string;
  role: 'student' | 'mentor' | 'admin';
  picture?: string;
}

export function getAllowedDomains(): string[] {
  const custom = process.env.ALLOWED_COLLEGE_DOMAINS;
  if (!custom) return DEFAULT_DOMAINS;
  return custom
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isDomainAllowed(email: string): boolean {
  const clean = email.toLowerCase().trim();
  const domain = clean.split('@')[1];
  if (!domain) return false;
  const allowed = getAllowedDomains();
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Necessary for faculty rights, never sufficient on its own. */
export function isFacultyDomain(email?: string): boolean {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(`@${FACULTY_DOMAIN}`);
}

/**
 * Admins named in the `ADMIN_EMAILS` environment variable. Configuration is
 * the only source besides the database `role` column — there is deliberately
 * no hardcoded list, because an address baked into the source grants whoever
 * can read the repository a route to the admin console.
 */
export function isConfiguredAdmin(email?: string): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  if (!isFacultyDomain(clean)) return false;
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(clean);
}

/**
 * The role an account actually holds right now, read from the database on
 * every call. A campus email grants nothing by itself: faculty rights need an
 * administrator's approval (`users.approved`), and admin rights need either a
 * seeded database row or an `ADMIN_EMAILS` entry.
 */
export async function resolveEffectiveRole(
  email: string
): Promise<{ role: 'student' | 'mentor' | 'admin'; approved: boolean }> {
  const clean = email.toLowerCase().trim();
  const record = await getUserByEmail(clean);

  if (!isFacultyDomain(clean)) {
    return { role: 'student', approved: false };
  }
  if (record?.role === 'admin' || isConfiguredAdmin(clean)) {
    return { role: 'admin', approved: true };
  }
  if (record?.approved) {
    return { role: 'mentor', approved: true };
  }
  return { role: 'student', approved: false };
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyGoogleCredential(credential: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  hd?: string;
}> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Google token validation failed (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
    hd?: string;
  };

  const isVerified = data.email_verified === 'true' || data.email_verified === true;
  if (!data.email || !isVerified) {
    throw new Error('Google email is unverified or missing.');
  }

  return {
    sub: data.sub || uuidv4(),
    email: data.email.toLowerCase().trim(),
    name: data.name?.trim() || data.email.split('@')[0],
    picture: data.picture,
    hd: data.hd,
  };
}

export async function authenticateGoogleUser(credential: string): Promise<{
  token: string;
  user: User;
}> {
  const info = await verifyGoogleCredential(credential);

  if (!isDomainAllowed(info.email)) {
    const allowed = getAllowedDomains().join(' or @');
    throw new Error(`Access restricted to official college email (@${allowed}). Personal or external accounts are not allowed.`);
  }

  const existing = await getUserByEmail(info.email);
  const { role, approved } = await resolveEffectiveRole(info.email);

  const userRecord: User = {
    id: existing?.id || info.sub || uuidv4(),
    email: info.email,
    realName: info.name || existing?.realName || info.email.split('@')[0],
    role,
    collegeDomain: info.email.split('@')[1],
    picture: info.picture || existing?.picture,
    approved,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  const savedUser = await upsertUser(userRecord);
  const token = generateToken({
    id: savedUser.id,
    email: savedUser.email,
    realName: savedUser.realName,
    role: savedUser.role,
    picture: savedUser.picture,
  });

  return { token, user: savedUser };
}

export async function authenticateDevDemoUser(email: string, realName?: string): Promise<{
  token: string;
  user: User;
}> {
  const cleanEmail = email.toLowerCase().trim();
  if (!isDomainAllowed(cleanEmail)) {
    const allowed = getAllowedDomains().join(' or @');
    throw new Error(`Domain not allowed. Email must end with @${allowed}`);
  }

  const existing = await getUserByEmail(cleanEmail);
  const { role, approved } = await resolveEffectiveRole(cleanEmail);

  const userRecord: User = {
    id: existing?.id || uuidv4(),
    email: cleanEmail,
    realName: realName?.trim() || existing?.realName || cleanEmail.split('@')[0],
    role,
    collegeDomain: cleanEmail.split('@')[1],
    picture: existing?.picture,
    approved,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  const savedUser = await upsertUser(userRecord);
  const token = generateToken({
    id: savedUser.id,
    email: savedUser.email,
    realName: savedUser.realName,
    role: savedUser.role,
    picture: savedUser.picture,
  });

  return { token, user: savedUser };
}

// ─── OTP (One-Time Password) Verification ─────────────────────────────────────

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpRecord>();

export function sendCollegeOtp(email: string): { success: boolean; devCode?: string } {
  const cleanEmail = email.toLowerCase().trim();
  if (!isDomainAllowed(cleanEmail)) {
    const allowed = getAllowedDomains().join(' or @');
    throw new Error(`Domain not allowed. Email must end with @${allowed}`);
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(cleanEmail, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
    attempts: 0,
  });

  console.log(`[auth-otp] Generated verification code for ${cleanEmail}: ${code}`);

  const isSmtpConfigured = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  return {
    success: true,
    // Return devCode if SMTP not yet configured so teachers/students aren't stranded
    devCode: isSmtpConfigured ? undefined : code,
  };
}

export async function verifyCollegeOtp(
  email: string,
  code: string,
  realName?: string
): Promise<{ token: string; user: User }> {
  const cleanEmail = email.toLowerCase().trim();
  const record = otpStore.get(cleanEmail);

  if (!record) {
    throw new Error('No OTP request found for this email. Please request a new code.');
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanEmail);
    throw new Error('Verification code expired. Please request a new code.');
  }

  if (record.attempts >= 5) {
    otpStore.delete(cleanEmail);
    throw new Error('Too many invalid attempts. Please request a new code.');
  }

  if (record.code !== code.trim()) {
    record.attempts++;
    throw new Error('Incorrect 6-digit code. Please check and try again.');
  }

  // Code verified! Remove from pending store
  otpStore.delete(cleanEmail);

  return authenticateDevDemoUser(cleanEmail, realName);
}

/**
 * The shared faculty passcode, or null when promotion by PIN is unavailable.
 * In production an unset `MENTOR_PIN` disables the route outright rather than
 * accepting a fallback — the previous default was a literal in this file, so
 * anyone who had read the repository could promote themselves to faculty.
 */
function getMentorPin(): string | null {
  const configured = process.env.MENTOR_PIN?.trim();
  if (configured) return configured;
  if (IS_PRODUCTION) return null;
  console.warn('[config] MENTOR_PIN is not set — using a development passcode. Do not deploy this.');
  return 'polaris-dev-pin';
}

export async function verifyAndPromoteMentorPin(email: string, pin: string): Promise<{
  token: string;
  user: User;
}> {
  const cleanEmail = email.toLowerCase().trim();
  const configuredPin = getMentorPin();

  if (!configuredPin) {
    throw new Error('Passcode promotion is disabled. Ask a university administrator to approve your faculty account.');
  }

  if (pin.trim() !== configuredPin) {
    throw new Error('Incorrect Mentor Passcode.');
  }

  if (!isFacultyDomain(cleanEmail)) {
    throw new Error(`Faculty status is strictly restricted to verified @${FACULTY_DOMAIN} accounts.`);
  }

  const updated = await setUserApproval(cleanEmail, true);
  if (!updated) {
    throw new Error('User not found.');
  }

  const token = generateToken({
    id: updated.id,
    email: updated.email,
    realName: updated.realName,
    role: updated.role,
    picture: updated.picture,
  });

  return { token, user: updated };
}

// ─── Express Auth Middleware ──────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in with your college email.' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Privilege checks read the database rather than trusting the `role` claim in
 * the token. Tokens live for 30 days, so a claim-only check would leave a
 * revoked mentor with working faculty access for up to a month. The freshly
 * resolved role is written back onto `req.user` so handlers downstream — the
 * ones that widen a query for admins — see the current value, not the claim.
 */
function requireRole(
  allowed: Array<'mentor' | 'admin'>,
  denial: string
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const email = req.user?.email;
      if (!email || !isFacultyDomain(email)) {
        res.status(403).json({ error: denial, needsPin: false });
        return;
      }

      resolveEffectiveRole(email)
        .then(({ role }) => {
          if (!allowed.includes(role as 'mentor' | 'admin')) {
            res.status(403).json({ error: denial, needsPin: false });
            return;
          }
          if (req.user) req.user.role = role;
          next();
        })
        .catch((err) => {
          console.error('[auth] Role lookup failed:', (err as Error).message);
          res.status(503).json({ error: 'Could not verify your privileges right now. Please try again.' });
        });
    });
  };
}

export const requireMentor = requireRole(
  ['mentor', 'admin'],
  `Faculty privileges required. Access is restricted to approved @${FACULTY_DOMAIN} faculty — ask a university administrator to approve your account.`
);

export const requireAdmin = requireRole(
  ['admin'],
  `University Administrator privileges required (@${FACULTY_DOMAIN}).`
);
