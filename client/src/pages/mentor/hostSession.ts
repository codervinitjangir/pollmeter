export const HOST_LS_KEY = 'pollsync_host';

export interface StoredHost {
  code: string;
  hostId: string;
}

export function getStoredHost(): StoredHost | null {
  try {
    const raw = localStorage.getItem(HOST_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredHost>;
    if (parsed.code && parsed.hostId) {
      return { code: parsed.code, hostId: parsed.hostId };
    }
  } catch {}
  return null;
}

export function setStoredHost(credentials: StoredHost): void {
  try {
    localStorage.setItem(HOST_LS_KEY, JSON.stringify(credentials));
  } catch {}
}

export function clearStoredHost(): void {
  try {
    localStorage.removeItem(HOST_LS_KEY);
  } catch {}
}
