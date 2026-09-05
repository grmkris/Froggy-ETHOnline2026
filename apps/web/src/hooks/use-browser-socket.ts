/**
 * The browser socket, client side.
 *
 * The single most important property: **frames never touch React state.** At
 * thirty frames a second a `setState` per frame would re-render the whole
 * workspace thirty times a second, and the chat pane would stutter every time
 * the page repainted. This hook owns the canvas bitmap directly and publishes
 * only the low-rate JSON state through React. Several details below are only
 * obvious after they have gone wrong once.
 */

import {
  decodeBrowserServerMessage,
  decodeScreencastFrame,
  encodeBrowserClientMessage,
  wsProtocols,
} from "@froggy/protocol";
import type { BrowserClientMessage, BrowserState } from "@froggy/protocol";
import { Result } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { socketUrl } from "../environment";
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

/**
 * A canvas painter, outside React entirely.
 *
 * Deliberately not a hook and not in the effect body. Frames arrive at thirty a
 * second; a `setState` per frame would re-render the whole workspace thirty
 * times a second and the chat pane would stutter every time the page repainted.
 * This closure owns the bitmap and React never learns a frame arrived.
 */
const createPainter = (
  canvasRef: RefObject<HTMLCanvasElement | null>
): ((data: ArrayBuffer) => Promise<void>) => {
  // Latest-frame-wins. A slow decode must never queue, or a client that falls
  // behind delivers a slideshow of moments that have already passed.
  let decoding = false;
  let queued: ArrayBuffer | null = null;

  const draw = async (data: ArrayBuffer): Promise<void> => {
    const frame = decodeScreencastFrame(new Uint8Array(data));
    if (frame === null) {
      return;
    }
    // A fresh copy: `frame.jpeg` is a view into the socket message, and the
    // bitmap outlives it.
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(frame.jpeg)], { type: "image/jpeg" })
    );
    const canvas = canvasRef.current;
    if (canvas !== null) {
      // Assigning width clears the canvas, so only on a real size change.
      if (canvas.width !== frame.meta.w || canvas.height !== frame.meta.h) {
        canvas.width = frame.meta.w;
        canvas.height = frame.meta.h;
      }
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    }
    bitmap.close();
  };

  const paint = async (data: ArrayBuffer): Promise<void> => {
    if (decoding) {
      queued = data;
      return;
    }
    decoding = true;
    try {
      await draw(data);
    } catch {
      // A truncated frame is superseded by the next one. Tearing down a stream
      // over one bad packet is a worse outcome than one dropped frame.
    } finally {
      decoding = false;
      const next = queued;
      queued = null;
      if (next !== null) {
        void paint(next);
      }
    }
  };

  return paint;
};

export const useBrowserSocket = (
  canvasRef: RefObject<HTMLCanvasElement | null>
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

    const paint = createPainter(canvasRef);

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
          void paint(event.data);
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
  }, [canConnect, canvasRef, getToken]);

  return { connected, send, state };
};
