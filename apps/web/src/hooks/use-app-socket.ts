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
  decodeAppServerMessage,
  encodeAppClientMessage,
  wsProtocols,
} from "@froggy/protocol";
import { Result } from "effect";
import { useCallback, useEffect, useReducer, useRef } from "react";

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

  return { ...state, dispatch, send };
};
