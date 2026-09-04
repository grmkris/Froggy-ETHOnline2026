/**
 * Two WebSockets, one `Bun.serve`.
 *
 * Bun gives a server exactly one `websocket` handler object, so the kind is
 * stamped into `ws.data` at upgrade time and every callback dispatches on it.
 *
 * The two sockets are separate because they have opposite shapes. The browser
 * socket is a firehose of large binary frames where the newest message
 * supersedes every earlier one and dropping is correct. The app socket is a
 * low-rate stream of small facts where every message matters — a freeze
 * acknowledgement must not queue behind a backlog of JPEGs.
 *
 * Both are origin-gated at upgrade. A WebSocket upgrade bypasses CORS entirely,
 * and the browser socket types into a Chrome logged into the user's sites, so
 * an unchecked upgrade would be a remote-control handle on someone's session.
 */

import {
  decodeAppClientMessage,
  decodeBrowserClientMessage,
  encodeAppServerMessage,
  encodeBrowserServerMessage,
} from "@froggy/protocol";
import type { AppServerMessage, BrowserState } from "@froggy/protocol";
import { Result } from "effect";

import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import type { WorkspaceSession } from "./session";

type SocketKind = "app" | "browser";

export interface SocketData {
  kind: SocketKind;
}

type Socket = Bun.ServerWebSocket<SocketData>;

/**
 * Frames dropped above this. Roughly three frames at quality 60 of 1280×800 —
 * enough to ride out a hiccup, small enough that a stalled client does not
 * accumulate seconds of stale video to deliver when it recovers.
 */
const MAX_BUFFERED_BYTES = 512 * 1024;

export interface SocketDeps {
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly session: WorkspaceSession;
}

export const isTrustedOrigin = (
  origin: string | null,
  allowed: readonly string[]
): boolean => {
  // A missing Origin is a non-browser client (curl, a test). Browsers always
  // send one on an upgrade, so absence cannot be a browser being sneaky.
  if (origin === null) {
    return true;
  }
  return allowed.includes(origin);
};

const sendApp = (socket: Socket, message: AppServerMessage): void => {
  socket.send(encodeAppServerMessage(message));
};

export const createSocketHandlers = (deps: SocketDeps) => {
  const appSockets = new Set<Socket>();
  const browserSockets = new Set<Socket>();
  const unsubscribes = new WeakMap<Socket, () => void>();

  const broadcastApp = (message: AppServerMessage): void => {
    const encoded = encodeAppServerMessage(message);
    for (const socket of appSockets) {
      socket.send(encoded);
    }
  };

  const broadcastBrowserState = (state: BrowserState): void => {
    // Browser state is small JSON on the *browser* socket, alongside the frames
    // it describes, so a tab list can never arrive before the frame it belongs to.
    const encoded = encodeBrowserServerMessage({
      state,
      type: "browser.state",
      v: 1,
    });
    for (const socket of browserSockets) {
      socket.send(encoded);
    }
  };

  const handlers: Bun.WebSocketHandler<SocketData> = {
    close(ws) {
      appSockets.delete(ws);
      browserSockets.delete(ws);
      unsubscribes.get(ws)?.();
      unsubscribes.delete(ws);
    },

    /**
     * The socket is writable again. Send the *newest* frame rather than
     * replaying what was dropped: a client that fell behind wants to see now,
     * not a slideshow of the past two seconds.
     */
    drain(ws) {
      if (ws.data.kind !== "browser") {
        return;
      }
      deps.services.browser.resendLatest({
        send: (encoded) => {
          if (ws.getBufferedAmount() > MAX_BUFFERED_BYTES) {
            return false;
          }
          ws.send(encoded);
          return true;
        },
      });
    },

    async message(ws, raw) {
      // Both sockets speak JSON in this direction; Bun hands us a string or a
      // buffer depending on how the client framed it, and the decoders below
      // are what actually establish the contract.
      const text = raw instanceof Buffer ? raw.toString("utf-8") : raw;

      if (ws.data.kind === "browser") {
        const decoded = decodeBrowserClientMessage(text);
        if (Result.isFailure(decoded)) {
          return;
        }
        const message = decoded.success;
        if (message.type === "ping") {
          // Answered here and never forwarded to the session. Routing a
          // keepalive through input handling would flip arbitration to `human`
          // every interval and starve the agent permanently.
          ws.send(
            encodeBrowserServerMessage({
              sentAt: message.sentAt,
              type: "pong",
              v: 1,
            })
          );
          return;
        }
        if (message.type === "browser.take") {
          // Abort first, *then* take the page. Flipping only the gate buys 1.5
          // seconds before the next queued tool call grabs it straight back,
          // which looks exactly like the button not working.
          deps.runs.abortAll();
        }
        try {
          await deps.services.browser.handleClientMessage(message);
        } catch (error) {
          // The session has already recorded a start failure in its own status,
          // which is what the pane renders. But a command that fails for any
          // other reason used to vanish here with nothing anywhere — and a
          // browser that silently does nothing is the hardest thing in this
          // system to debug from the outside.
          console.warn(
            `browser ${message.type} failed:`,
            error instanceof Error ? error.message : error
          );
        }
        return;
      }

      const decoded = decodeAppClientMessage(text);
      if (Result.isFailure(decoded)) {
        sendApp(ws, {
          code: "decode_failed",
          message: "Message did not match the app protocol.",
          type: "protocol.error",
          v: 1,
        });
        return;
      }
      const message = decoded.success;
      switch (message.type) {
        case "ping": {
          sendApp(ws, { sentAt: message.sentAt, type: "pong", v: 1 });
          return;
        }
        case "mandate.freeze": {
          const mandate = deps.session.setFrozen(message.frozen);
          // Freezing stops the turn as well as the spending. Stopping only the
          // spending would leave the agent running against a wallet it can no
          // longer use, narrating failures.
          if (message.frozen) {
            deps.runs.abortAll();
          }
          broadcastApp({ mandate, type: "mandate.state", v: 1 });
          return;
        }
        case "mandate.update": {
          const mandate = deps.session.updateMandate(message.mandate);
          broadcastApp({ mandate, type: "mandate.state", v: 1 });
          return;
        }
        case "approval.resolve": {
          broadcastApp({
            requestId: message.requestId,
            type: "approval.resolved",
            v: 1,
          });
          break;
        }
        default: {
          break;
        }
      }
    },

    open(ws) {
      if (ws.data.kind === "app") {
        appSockets.add(ws);
        sendApp(ws, {
          modes: deps.services.environment.modes,
          sessionId: deps.session.id,
          type: "session.welcome",
          v: 1,
        });
        sendApp(ws, {
          mandate: deps.session.currentMandate,
          type: "mandate.state",
          v: 1,
        });
        void (async () => {
          const wallet = await deps.session.walletSummary();
          sendApp(ws, { type: "wallet.state", v: 1, wallet });
        })();
        return;
      }

      browserSockets.add(ws);
      ws.send(
        encodeBrowserServerMessage({
          state: deps.services.browser.state(),
          type: "browser.state",
          v: 1,
        })
      );
      unsubscribes.set(
        ws,
        deps.services.browser.subscribe({
          send: (encoded) => {
            if (ws.getBufferedAmount() > MAX_BUFFERED_BYTES) {
              return false;
            }
            ws.send(encoded);
            return true;
          },
        })
      );
    },
  };

  return { broadcastApp, broadcastBrowserState, handlers };
};
