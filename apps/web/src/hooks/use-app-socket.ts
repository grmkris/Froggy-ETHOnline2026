/**
 * The app socket: wallet, mandate, receipts, approvals, policy decisions.
 *
 * Low rate and every message matters, so unlike the browser socket this one
 * does live in React state — through the pure reducer in `lib/app-state.ts`,
 * which is where the rules live and where they are tested. This hook owns the
 * connection and nothing else: token, backoff, keepalive.
 */

import type { AppClientMessage } from "@froggy/protocol";
import {
  BrowseTasksResponse,
  decodeAppServerMessage,
  encodeAppClientMessage,
  wsProtocols,
} from "@froggy/protocol";
import { Result, Schema } from "effect";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { socketUrl } from "../environment";
import { initialAppState, reduceApp } from "../lib/app-state";
import type { AppEvent, AppState } from "../lib/app-state";
import { useSessionToken } from "../lib/session-token";

const PING_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5000;

/** Exponential, capped. Shared by both reconnect paths in the effect below. */
const backoffMs = (attempt: number): number =>
  Math.min(750 * 2 ** attempt, MAX_BACKOFF_MS);

export interface AppStream extends AppState {
  readonly retryBrowseTasks: () => void;
  readonly dispatch: (event: AppEvent) => void;
  readonly send: (message: AppClientMessage) => void;
}

export const useAppSocket = (): AppStream => {
  const [state, dispatch] = useReducer(reduceApp, initialAppState);
  const socketRef = useRef<WebSocket | null>(null);
  const { canConnect, getToken } = useSessionToken();

  const send = useCallback((message: AppClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(encodeAppClientMessage(message));
  }, []);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;

    const open = async (): Promise<void> => {
      if (closed) {
        return;
      }
      // Fetched per attempt, not once: a reconnect after a long sleep needs
      // the refreshed token, and the old one would be refused forever.
      const token = await getToken();
      if (closed) {
        return;
      }
      if (token === null) {
        attempt += 1;
        reconnect = setTimeout(() => {
          void open();
        }, backoffMs(attempt));
        return;
      }
      socket = new WebSocket(socketUrl("/ws/app"), wsProtocols(token));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        dispatch({ connected: true, type: "socket" });
        ping = setInterval(() => {
          socket?.send(
            encodeAppClientMessage({ sentAt: Date.now(), type: "ping", v: 1 })
          );
        }, PING_INTERVAL_MS);
      });

      socket.addEventListener("message", (event: MessageEvent<unknown>) => {
        const decoded = decodeAppServerMessage(String(event.data));
        if (Result.isFailure(decoded)) {
          return;
        }
        dispatch({ at: Date.now(), message: decoded.success, type: "server" });
      });

      socket.addEventListener("close", () => {
        dispatch({ connected: false, type: "socket" });
        if (ping !== null) {
          clearInterval(ping);
        }
        if (closed) {
          return;
        }
        // Inlined rather than shared with the token-failure path above: a
        // helper that calls `open` and is declared before it reads as a
        // forward reference, and the duplication is three lines.
        attempt += 1;
        reconnect = setTimeout(() => {
          void open();
        }, backoffMs(attempt));
      });
    };

    if (!canConnect) {
      // Still returns a cleanup, so the effect has one shape rather than two.
      return () => {
        closed = true;
      };
    }

    void open();

    return () => {
      closed = true;
      if (ping !== null) {
        clearInterval(ping);
      }
      if (reconnect !== null) {
        clearTimeout(reconnect);
      }
      socket?.close();
      socketRef.current = null;
    };
  }, [canConnect, getToken]);

  const { sessionId, connected } = state;
  const [recoveryRequestedAt, setRecoveryRequestedAt] = useState(0);
  const lastManualRecovery = useRef(0);
  const retryBrowseTasks = useCallback(() => {
    const now = Date.now();
    if (now - lastManualRecovery.current < 5000) {
      return;
    }
    lastManualRecovery.current = now;
    setRecoveryRequestedAt(now);
  }, []);
  useEffect(() => {
    if (!connected || sessionId === null) {
      return () => {
        // No active resource needs cleanup.
      };
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    const recover = async (): Promise<void> => {
      // Only failed snapshots retry. Provider polling remains server-owned.
      if (controller.signal.aborted) {
        return;
      }
      let recovered = false;
      try {
        const token = await getToken();
        const response = await fetch("/api/browse-tasks", {
          headers: { authorization: `Bearer ${token ?? ""}` },
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        });
        if (response.ok) {
          const value = Schema.decodeUnknownSync(BrowseTasksResponse)(
            await response.json()
          );
          if (!controller.signal.aborted) {
            dispatch({
              type: "browse.snapshot",
              sessionId,
              tasks: value.tasks,
            });
            recovered = true;
          }
        }
      } catch {
        recovered = false;
      }
      if (controller.signal.aborted || recovered) {
        return;
      }
      dispatch({ type: "browse.error", sessionId });
      if (retries < 3) {
        const delay = 5000 * 2 ** retries;
        retries += 1;
        timer = setTimeout(() => {
          void recover();
        }, delay);
      }
    };
    const delay = Math.max(0, recoveryRequestedAt + 5000 - Date.now());
    timer = setTimeout(() => {
      void recover();
    }, delay);
    return () => {
      controller.abort();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [getToken, connected, sessionId, recoveryRequestedAt]);
  return { ...state, dispatch, send, retryBrowseTasks };
};
