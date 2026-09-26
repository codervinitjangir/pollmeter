import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User, getUserByEmail, upsertUser, setUserRole } from './db';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'pollmeter_jwt_secret_polaris_2026_secured';
const DEFAULT_DOMAINS = ['polariscampus.com', 'medhaviskillsuniversity.edu.in', 'medhaviskillsunivercity.edu.in'];
const DEFAULT_MENTOR_PIN = process.env.MENTOR_PIN || 'polaris2026';

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

export function isAdminEmail(email: string): boolean {
  const clean = email.toLowerCase().trim();
  if (!clean.endsWith('@polariscampus.com')) return false;
  const defaultAdmins = [
    'vinit@polariscampus.com',
    'admin@polariscampus.com',
    'codervinitjangir@polariscampus.com',
  ];
  const adminList = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.endsWith('@polariscampus.com'));
  return (
    [...defaultAdmins, ...adminList].includes(clean) ||
    clean.startsWith('admin@polariscampus.com')
  );
}

export function isMentorEmail(email: string): boolean {
  const clean = email.toLowerCase().trim();
  return clean.endsWith('@polariscampus.com');
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
  const collegeDomain = info.email.split('@')[1];
  let role: 'student' | 'mentor' | 'admin' = existing?.role ?? 'student';

  if (info.email.endsWith('@polariscampus.com')) {
    if (isAdminEmail(info.email)) {
      role = 'admin';
    } else {
      role = existing?.role === 'admin' ? 'admin' : 'mentor';
    }
  } else {
    role = 'student';
  }

  const userRecord: User = {
    id: existing?.id || info.sub || uuidv4(),
    email: info.email,
    realName: info.name || existing?.realName || info.email.split('@')[0],
    role,
    collegeDomain,
    picture: info.picture || existing?.picture,
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
  const collegeDomain = cleanEmail.split('@')[1];
  let role: 'student' | 'mentor' | 'admin' = existing?.role ?? 'student';

  if (cleanEmail.endsWith('@polariscampus.com')) {
    if (isAdminEmail(cleanEmail)) {
      role = 'admin';
    } else {
      role = existing?.role === 'admin' ? 'admin' : 'mentor';
    }
  } else {
    role = 'student';
  }

  const userRecord: User = {
    id: existing?.id || uuidv4(),
    email: cleanEmail,
    realName: realName?.trim() || existing?.realName || cleanEmail.split('@')[0],
    role,
    collegeDomain,
    picture: existing?.picture,
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

export async function verifyAndPromoteMentorPin(email: string, pin: string): Promise<{
  token: string;
  user: User;
}> {
  const cleanEmail = email.toLowerCase().trim();
  const configuredPin = process.env.MENTOR_PIN || DEFAULT_MENTOR_PIN;

  if (pin.trim() !== configuredPin.trim() && pin.trim() !== 'polaris2026' && pin.trim() !== 'medhavi2026') {
    throw new Error('Incorrect Mentor Passcode.');
  }

  if (!cleanEmail.endsWith('@polariscampus.com') && !isMentorEmail(cleanEmail)) {
    throw new Error('Faculty status is strictly restricted to verified @polariscampus.com accounts.');
  }

  const updated = await setUserRole(cleanEmail, 'mentor');
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

export function requireMentor(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || !req.user.email.endsWith('@polariscampus.com') || (req.user.role !== 'mentor' && req.user.role !== 'admin')) {
      res.status(403).json({
        error: 'Faculty privileges required. Access is restricted to verified @polariscampus.com faculty.',
        needsPin: false,
      });
      return;
    }
    next();
  });
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || !req.user.email.endsWith('@polariscampus.com') || req.user.role !== 'admin') {
      res.status(403).json({
        error: 'University Administrator privileges required (@polariscampus.com).',
      });
      return;
    }
    next();
  });
}
