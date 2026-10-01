import { apiUrl } from './api';
import { Question, QuizDraft, QuizDraftSummary } from './types';

export interface AuthUser {
  id: string;
  email: string;
  realName: string;
  role: 'student' | 'mentor' | 'admin';
  picture?: string;
  /** Whether an administrator has approved this account for faculty rights. */
  approved?: boolean;
  /**
   * True for a campus-domain account that is waiting on approval. Lets the UI
   * say "your request is pending" instead of the flatly wrong "you are a
   * student" — the distinction only the server can make.
   */
  facultyPending?: boolean;
  subject?: string;
  department?: string;
}

/** Campus domain for faculty. Kept in one place so the UI copy stays truthful. */
export const FACULTY_DOMAIN = 'polariscampus.com';

const AUTH_KEY = 'pollmeter_auth_session';

// In-memory fallback prevents loss of session in Safari Private Browsing or restricted environments
let memoryAuth: { token: string; user: AuthUser } | null = null;

export function getStoredAuth(): { token: string; user: AuthUser } | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return memoryAuth;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.user?.email) return memoryAuth;

    // Accounts on the faculty domain receive mentor access by default, unless explicitly revoked (approved === false)
    if (isFacultyEmail(parsed.user.email)) {
      if (parsed.user.approved === false) {
        parsed.user.role = 'student';
      } else {
        if (parsed.user.role !== 'admin') {
          parsed.user.role = 'mentor';
        }
        parsed.user.approved = true;
      }
      parsed.user.facultyPending = false;
    }

    memoryAuth = parsed;
    return parsed;
  } catch {
    return memoryAuth;
  }
}

/**
 * Whether the address belongs to the campus domain.
 */
export function isFacultyEmail(email?: string): boolean {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(`@${FACULTY_DOMAIN}`);
}

export function getAuthToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function getAuthUser(): AuthUser | null {
  return getStoredAuth()?.user ?? null;
}

export function setStoredAuth(token: string, user: AuthUser): void {
  if (isFacultyEmail(user.email)) {
    if (user.approved === false) {
      user.role = 'student';
    } else {
      if (user.role !== 'admin') {
        user.role = 'mentor';
      }
      user.approved = true;
    }
    user.facultyPending = false;
  }
  memoryAuth = { token, user };
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
  } catch (err) {
    console.warn('[auth] Local storage not accessible, using memory session:', err);
  }
}

export async function refreshAuthUser(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearStoredAuth();
      }
      return null;
    }
    const data = await res.json();
    if (data.user) {
      if (isFacultyEmail(data.user.email)) {
        if (data.user.approved === false) {
          data.user.role = 'student';
        } else {
          if (data.user.role !== 'admin') {
            data.user.role = 'mentor';
          }
          data.user.approved = true;
        }
        data.user.facultyPending = false;
      }
      setStoredAuth(data.token || token, data.user);
      return data.user;
    }
  } catch (err) {
    console.error('[auth] Failed to refresh user session:', err);
  }
  return null;
}

export function clearStoredAuth(): void {
  memoryAuth = null;
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
      allowedDomains: [FACULTY_DOMAIN, 'medhaviskillsuniversity.edu.in', 'medhaviskillsunivercity.edu.in'],
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
  userExists: boolean;
  existingName?: string;
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

/**
 * Downloads a quiz gradebook as CSV.
 *
 * Fetched rather than linked, because the export route is behind
 * `Authorization: Bearer` and a plain `<a href>` cannot carry a header — a
 * link would hit the route unauthenticated and download a 401 body as a
 * `.csv` file. The blob URL is revoked immediately; the browser has already
 * copied the data by the time the click handler returns.
 */
export async function downloadQuizCsv(id: string, filenameHint?: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl(`/api/mentor/quizzes/${id}/export.csv`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to export quiz results');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const safeHint = (filenameHint || 'quiz')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'quiz';

  const link = document.createElement('a');
  link.href = url;
  link.download = `pollmeter-${safeHint}-${id.slice(0, 8)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface MentorReportRow {
  id: string;
  code: string;
  topic: string;
  subject: string;
  batch: string;
  hostEmail: string;
  hostName: string;
  createdAt: string;
  endedAt?: string | null;
  questionCount: number;
  participantCount: number;
  responseCount: number;
  averageScore: number;
  accuracyPercent: number;
  averageTimeSeconds: number;
  topScorer?: { name: string; email?: string; totalScore: number } | null;
}

export interface MentorReports {
  reports: MentorReportRow[];
  totals: {
    sessions?: number;
    quizzes: number;
    participants: number;
    responses: number;
    averageScore?: number;
    accuracyPercent: number;
  };
}

export async function fetchMentorReports(options?: {
  batch?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
  mentorEmail?: string;
  subject?: string;
  year?: number | string;
  mentorQuery?: string;
}): Promise<MentorReports> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const params = new URLSearchParams();
  if (options?.batch && options.batch !== 'all') params.set('batch', options.batch);
  if (options?.timeRange && options.timeRange !== 'all') params.set('timeRange', options.timeRange);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.mentorEmail) params.set('mentorEmail', options.mentorEmail);
  if (options?.subject && options.subject !== 'all') params.set('subject', options.subject);
  if (options?.year && options.year !== 'all') params.set('year', String(options.year));
  if (options?.mentorQuery) params.set('mentorQuery', options.mentorQuery);

  const qs = params.toString();
  const res = await fetch(apiUrl(qs ? `/api/mentor/reports?${qs}` : '/api/mentor/reports'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch mentor reports');
  }

  return await res.json();
}

/**
 * Lists all active subjects in use across the university.
 */
export async function fetchSubjects(): Promise<string[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch(apiUrl('/api/subjects'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.subjects || [];
  } catch (err) {
    console.error('[auth] Failed to fetch subjects:', err);
    return [];
  }
}

/**
 * Mentor self-service: update their profile subject, department, or display name.
 */
export async function updateMentorProfile(updates: {
  subject?: string;
  department?: string;
  realName?: string;
}): Promise<{ user: AuthUser; token: string }> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl('/api/mentor/profile'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update profile');
  }

  if (data.token && data.user) {
    setStoredAuth(data.token, data.user);
  }
  return data;
}

/**
 * Admin: Download campus-wide filtered reports as CSV.
 */
export async function exportCampusReportsCsv(options?: {
  batch?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
  subject?: string;
  year?: number | string;
  mentorQuery?: string;
}): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const params = new URLSearchParams();
  if (options?.batch && options.batch !== 'all') params.set('batch', options.batch);
  if (options?.timeRange && options.timeRange !== 'all') params.set('timeRange', options.timeRange);
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);
  if (options?.subject && options.subject !== 'all') params.set('subject', options.subject);
  if (options?.year && options.year !== 'all') params.set('year', String(options.year));
  if (options?.mentorQuery) params.set('mentorQuery', options.mentorQuery);

  const qs = params.toString();
  const res = await fetch(apiUrl(qs ? `/api/admin/reports/export.csv?${qs}` : '/api/admin/reports/export.csv'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to export reports CSV');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `pollmeter-campus-report-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


// ─── University Administration API ──────────────────────────────────────────

export interface FacultyMember {
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
  /**
   * False for a campus account that has signed in but has not been approved.
   * The roster deliberately includes these so an administrator can see who is
   * waiting instead of having to be told out-of-band.
   */
  approved?: boolean;
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

export interface BatchObject {
  id: string;
  year?: string;
  label: string;
  displayName: string;
  status: 'active' | 'inactive';
  createdBy?: string;
  createdByRole?: string;
  createdAt: string;
}

/** Returns display-name strings for backward-compat dropdowns. */
export async function fetchBatches(): Promise<string[]> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(apiUrl('/api/batches'), { headers });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data.batches)) return data.batches;
    return [];
  } catch {
    return [];
  }
}

/** Returns the full Batch objects from the database (includes id, status, etc.). */
export async function fetchBatchObjects(): Promise<BatchObject[]> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(apiUrl('/api/batches'), { headers });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data.batchObjects)) return data.batchObjects;
    if (Array.isArray(data.batches)) {
      return data.batches.map((name: string, i: number) => ({
        id: `local-${i}`,
        displayName: name,
        label: name,
        status: 'active' as const,
        createdAt: '',
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Mentor self-service: create a new batch inline from the quiz creation screen.
 * Returns the created BatchObject, or throws on failure.
 */
export async function createMentorBatch(displayName: string): Promise<BatchObject> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl('/api/mentor/batches'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create batch');
  }
  return data.batch;
}

/** Admin: create a batch from the admin panel. */
export async function adminCreateBatch(displayName: string): Promise<BatchObject> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/batches'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create batch');
  return data.batch;
}

/** Admin: fetch all batches including inactive. */
export async function adminFetchBatches(): Promise<BatchObject[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');
  const res = await fetch(apiUrl('/api/admin/batches'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch batches');
  return data.batches || [];
}

/** Admin: deactivate (soft-delete) a batch by id. */
export async function adminDeactivateBatch(id: string): Promise<boolean> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');
  const res = await fetch(apiUrl(`/api/admin/batches/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to deactivate batch');
  return data.success;
}

/** Admin: rename or update status of a batch. */
export async function adminRenameBatch(
  id: string,
  displayName: string,
  status?: 'active' | 'inactive'
): Promise<BatchObject> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl(`/api/admin/batches/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName, status }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update batch');
  return data.batch;
}

/** Admin: merge a source batch into a target batch. */
export async function adminMergeBatches(sourceId: string, targetId: string): Promise<boolean> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(
    apiUrl(`/api/admin/batches/${encodeURIComponent(sourceId)}/merge-into/${encodeURIComponent(targetId)}`),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to merge batches');
  return data.success;
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

/**
 * Grants or withdraws the faculty approval flag. Separate from
 * `addAdminFaculty` because approving somebody who already signed in should
 * not require re-typing their department and batches — and separate from
 * `removeAdminFaculty` because a pending account was never on the roster to
 * remove in the first place.
 */
export async function setFacultyApproval(
  email: string,
  approved: boolean
): Promise<FacultyMember> {
  const token = getAuthToken();
  if (!token) throw new Error('Administrator authentication required');

  const res = await fetch(apiUrl('/api/admin/faculty/approve'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, approved }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update faculty approval');
  }

  return data.faculty;
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

// ─── Quiz Drafts Client API ───────────────────────────────────────────────────

export async function fetchQuizDrafts(
  status: string = 'draft',
  mentorEmail?: string
): Promise<QuizDraftSummary[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (mentorEmail) params.set('mentorEmail', mentorEmail);

  const qs = params.toString();
  const url = qs ? apiUrl(`/api/mentor/quizzes/draft?${qs}`) : apiUrl('/api/mentor/quizzes/draft');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch quiz drafts');
  }

  return res.json();
}

export async function fetchQuizDraftById(id: string): Promise<QuizDraft> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl(`/api/mentor/quizzes/draft/${id}`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch quiz draft');
  }

  return res.json();
}

export async function createQuizDraft(data: {
  title: string;
  subject?: string;
  questions: Question[];
}): Promise<QuizDraft> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl('/api/mentor/quizzes/draft'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create quiz draft');
  }

  return res.json();
}

export async function updateQuizDraft(
  id: string,
  data: {
    title?: string;
    subject?: string;
    questions?: Question[];
    status?: 'draft' | 'archived';
  }
): Promise<QuizDraft> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl(`/api/mentor/quizzes/draft/${id}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update quiz draft');
  }

  return res.json();
}

export async function deleteQuizDraft(id: string): Promise<boolean> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl(`/api/mentor/quizzes/draft/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete quiz draft');
  }

  return true;
}


