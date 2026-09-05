/**
 * The browser socket, client side.
 *
 * The single most important property: **frames never touch React state.**
 * The painter in `lib/browser-painter.ts` owns the bitmap; this hook owns the
 * connection and publishes only the low-rate JSON state through React.
 *
 * `enabled` exists for the pop-out: while a separate window holds the page,
 * the main tab drops its browser socket so the server casts to one watcher
 * rather than two.
 */

import {
  decodeBrowserServerMessage,
  encodeBrowserClientMessage,
  wsProtocols,
} from "@froggy/protocol";
import type { BrowserClientMessage, BrowserState } from "@froggy/protocol";
import { Result } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { socketUrl } from "../environment";
import type { BrowserPainter } from "../lib/browser-painter";
import { useSessionToken } from "../lib/session-token";

const PING_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5000;

/** Exponential, capped. Shared by both reconnect paths in the effect below. */
const backoffMs = (attempt: number): number =>
  Math.min(750 * 2 ** attempt, MAX_BACKOFF_MS);

export interface BrowserStream {
  readonly connected: boolean;
  readonly send: (message: BrowserClientMessage) => void;
  readonly state: BrowserState | null;
}

export const useBrowserSocket = (
  painter: BrowserPainter,
  enabled = true
): BrowserStream => {
  const [state, setState] = useState<BrowserState | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const { canConnect, getToken } = useSessionToken();

  const send = useCallback((message: BrowserClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(encodeBrowserClientMessage(message));
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
      socket = new WebSocket(socketUrl("/ws/browser"), wsProtocols(token));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnected(true);
        ping = setInterval(() => {
          socket?.send(
            encodeBrowserClientMessage({
              sentAt: Date.now(),
              type: "ping",
              v: 1,
            })
          );
        }, PING_INTERVAL_MS);
      });

      socket.addEventListener("message", (event: MessageEvent<unknown>) => {
        if (event.data instanceof ArrayBuffer) {
          painter.paint(event.data);
          return;
        }
        const decoded = decodeBrowserServerMessage(String(event.data));
        if (Result.isFailure(decoded)) {
          return;
        }
        if (decoded.success.type === "browser.state") {
          setState(decoded.success.state);
        }
      });

      socket.addEventListener("close", (event) => {
        setConnected(false);
        if (ping !== null) {
          clearInterval(ping);
        }
        // 4004 is terminal — the server does not know this browser and never
        // will, so retrying is a busy loop against a certain refusal.
        if (closed || event.code === 4004) {
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

    if (!(canConnect && enabled)) {
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
  }, [canConnect, enabled, getToken, painter]);

  return { connected, send, state };
};
