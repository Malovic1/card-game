import { io, Socket } from 'socket.io-client';

const env = (import.meta as { env?: { VITE_SERVER_URL?: string } }).env;
// Default to the same host the page was loaded from, so other devices on the LAN
// connect to the game server on the host machine instead of their own localhost.
const SERVER_URL =
  env?.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:4000`;

let socket: Socket | null = null;

export function connect(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnectionAttempts: 8,
    });
  } else if (socket.disconnected) {
    socket.connect();
  }
  return socket;
}

export function getSocket(): Socket {
  if (!socket) throw new Error('Socket not connected');
  return socket;
}
