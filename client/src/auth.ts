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

export async function fetchMentorQuizzes(): Promise<any[]> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(apiUrl('/api/mentor/quizzes'), {
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
