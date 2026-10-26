import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function realtimeSocket() {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: true
    });
  }
  return socket;
}

export type RealtimeAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export class RealtimeClientError extends Error {
  constructor(
    message: string,
    public code = "REALTIME_FAILED"
  ) {
    super(message);
  }
}

function waitForConnection(active: Socket) {
  if (active.connected) return Promise.resolve();
  active.connect();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new RealtimeClientError("The live connection could not be established.", "CONNECT_TIMEOUT")), 8_000);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      active.off("connect", connected);
      active.off("connect_error", failed);
      if (error) reject(error);
      else resolve();
    };
    const connected = () => finish();
    const failed = () => finish(new RealtimeClientError("The live connection was rejected. Sign in or join again.", "CONNECT_REJECTED"));
    active.once("connect", connected);
    active.once("connect_error", failed);
  });
}

export async function emitWithAck<T>(event: string, payload: unknown) {
  const active = realtimeSocket();
  if (!active.connected && !["campaign:watch", "scene:join"].includes(event))
    throw new RealtimeClientError("Changes are paused while disconnected. Reconnect before trying again.", "OFFLINE");
  await waitForConnection(active);
  return new Promise<T>((resolve, reject) => {
    active.timeout(15_000).emit(event, payload, (timeoutError: Error | null, result?: RealtimeAck<T>) => {
      if (timeoutError)
        return reject(new RealtimeClientError("The live connection did not answer in time.", "ACK_TIMEOUT"));
      if (!result) return reject(new RealtimeClientError("The live connection returned no result.", "EMPTY_ACK"));
      if (!result.ok) return reject(new RealtimeClientError(result.error.message, result.error.code));
      resolve(result.data);
    });
  });
}
