import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

// Dev: Vite proxies /socket.io to Express server.
// Cloudflare Pages / separate deploy: points to Render backend.
// Production single-origin: same-origin by default.
const URL = getApiBaseUrl() || (import.meta.env.MODE === 'production' ? window.location.origin : '/');

/**
 * Classroom wifi drops. Retry forever with backoff rather than giving up after
 * ten tries and stranding a student mid-quiz.
 */
const socket: Socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  randomizationFactor: 0.4,
  timeout: 10000,
  transports: ['polling', 'websocket'],
});

export function ensureConnected(): void {
  if (!socket.connected) socket.connect();
}

export default socket;
