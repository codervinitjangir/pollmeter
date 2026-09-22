import { io, Socket } from 'socket.io-client';

// Dev: Vite proxies /socket.io to Express server.
// Production: same-origin by default, or VITE_SERVER_URL if deployed separately.
const URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.MODE === 'production' ? window.location.origin : '/');

/**
 * Classroom wifi drops. Retry forever with backoff rather than giving up after
 * ten tries and stranding a student mid-quiz.
 */
const socket: Socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  randomizationFactor: 0.4,
  timeout: 10000,
  transports: ['websocket', 'polling'],
});

export function ensureConnected(): void {
  if (!socket.connected) socket.connect();
}

export default socket;
