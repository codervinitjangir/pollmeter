/**
 * Returns the backend API base URL.
 * 
 * - If VITE_SERVER_URL is explicitly provided, use that.
 * - If running on Cloudflare Pages (*.pages.dev), point to the production backend on Render.
 * - Otherwise (local development or Render fullstack), use relative path ('' or window.location.origin).
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('pages.dev')) {
    return 'https://pollmeter.onrender.com';
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
