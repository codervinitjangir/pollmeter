import { apiUrl } from './api';

export interface AuthUser {
  id: string;
  email: string;
  realName: string;
  role: 'student' | 'mentor' | 'admin';
  picture?: string;
}

const AUTH_KEY = 'pollmeter_auth_session';

export function getStoredAuth(): { token: string; user: AuthUser } | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.user?.email) return null;
    return parsed;
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

export function getAuthToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function getAuthUser(): AuthUser | null {
  return getStoredAuth()?.user ?? null;
}

export function setStoredAuth(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
  } catch (err) {
    console.error('[auth] Failed to persist auth session:', err);
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch (err) {
    console.error('[auth] Failed to clear auth session:', err);
  }
}

export async function fetchCollegeConfig(): Promise<{
  allowedDomains: string[];
  googleClientId: string | null;
}> {
  try {
    const res = await fetch(apiUrl('/api/auth/domains'));
    if (!res.ok) throw new Error('Failed to load domains config');
    return await res.json();
  } catch {
    return {
      allowedDomains: ['medhaviskillsuniversity.edu.in', 'medhaviskillsunivercity.edu.in'],
      googleClientId: null,
    };
  }
}

export async function loginWithGoogleCredential(credential: string): Promise<{
  token: string;
  user: AuthUser;
}> {
  const res = await fetch(apiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Google Sign-in failed');
  }

  setStoredAuth(data.token, data.user);
  return data;
}

export async function sendCollegeOtp(email: string): Promise<{
  success: boolean;
  devCode?: string;
}> {
  const res = await fetch(apiUrl('/api/auth/otp/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send verification code');
  }

  return data;
}

export async function verifyCollegeOtp(
  email: string,
  code: string,
  realName?: string
): Promise<{
  token: string;
  user: AuthUser;
}> {
  const res = await fetch(apiUrl('/api/auth/otp/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, realName }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid verification code');
  }

  setStoredAuth(data.token, data.user);
  return data;
}

export async function loginWithCollegeDemo(email: string, realName: string): Promise<{
  token: string;
  user: AuthUser;
}> {
  const res = await fetch(apiUrl('/api/auth/demo'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, realName }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'College login failed');
  }

  setStoredAuth(data.token, data.user);
  return data;
}

export async function verifyMentorPin(pin: string): Promise<{
  token: string;
  user: AuthUser;
}> {
  const token = getAuthToken();
  if (!token) throw new Error('Please sign in first');

  const res = await fetch(apiUrl('/api/auth/verify-mentor-pin'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pin }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Invalid Mentor PIN');
  }

  setStoredAuth(data.token, data.user);
  return data;
}

export async function fetchMentorQuizzes(options?: {
  batch?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
  mentorEmail?: string;
}): Promise<any[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const params = new URLSearchParams();
  if (options?.batch && options.batch !== 'all') params.set('batch', options.batch);
  if (options?.timeRange && options.timeRange !== 'all') params.set('timeRange', options.timeRange);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.mentorEmail) params.set('mentorEmail', options.mentorEmail);

  const qs = params.toString();
  const url = qs ? apiUrl(`/api/mentor/quizzes?${qs}`) : apiUrl('/api/mentor/quizzes');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch mentor quizzes');
  }

  const data = await res.json();
  return data.quizzes || [];
}

export async function fetchQuizDetails(id: string): Promise<{
  session: any;
  participants: any[];
  responses: any[];
}> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl(`/api/mentor/quizzes/${id}`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch quiz details');
  }

  return await res.json();
}

export async function fetchStudentQuizzes(): Promise<any[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl('/api/student/quizzes'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch student quizzes');
  }

  const data = await res.json();
  return data.history || [];
}

// ─── University Administration API ──────────────────────────────────────────

export interface FacultyMember {
  id: string;
  email: string;
  realName: string;
  role: 'mentor' | 'admin';
  collegeDomain: string;
  department?: string;
  subject?: string;
  batches?: string[];
  picture?: string;
  createdAt: string;
}

export interface UniversityOverview {
  totalMentors: number;
  totalStudents: number;
  totalQuizzes: number;
  totalResponses: number;
  subjects: Array<{ subject: string; count: number }>;
  batches: Array<{ batch: string; count: number }>;
  recentQuizzes: any[];
}

export interface StudentAuditItem {
  email: string;
  realName: string;
  quizCount: number;
  avgScore: number;
  lastQuizDate?: string;
}

export async function fetchBatches(): Promise<string[]> {
  try {
    const res = await fetch(apiUrl('/api/batches'));
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.batches || [];
  } catch {
    return [
      '1st Year - Batch A',
      '1st Year - Batch B',
      '1st Year - Batch C',
      '2nd Year - Batch A',
      '2nd Year - Batch B',
      '2nd Year - Batch C',
      '3rd Year - Batch A',
    ];
  }
}

export async function fetchAdminOverview(): Promise<UniversityOverview> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/overview'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch university overview');
  }

  return await res.json();
}

export async function fetchAdminFaculty(): Promise<FacultyMember[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/faculty'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch faculty list');
  }

  const data = await res.json();
  return data.faculty || [];
}

export async function addAdminFaculty(payload: {
  email: string;
  realName: string;
  department?: string;
  subject?: string;
  batches?: string[];
  role?: 'mentor' | 'admin';
}): Promise<FacultyMember> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/faculty'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to add or update faculty member');
  }

  return data.faculty;
}

export async function removeAdminFaculty(email: string): Promise<boolean> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl(`/api/admin/faculty/${encodeURIComponent(email)}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to remove faculty member');
  }

  return data.success;
}

export async function searchStudentAudit(q?: string): Promise<StudentAuditItem[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const url = q ? apiUrl(`/api/admin/students?q=${encodeURIComponent(q)}`) : apiUrl('/api/admin/students');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search students');
  }

  const data = await res.json();
  return data.students || [];
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  action: string;
  targetId?: string;
  metadata?: any;
  createdAt: string;
}

export async function fetchAdminAuditLogs(): Promise<AuditLogItem[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/audit-logs'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch audit logs');
  }

  const data = await res.json();
  return data.logs || [];
}

