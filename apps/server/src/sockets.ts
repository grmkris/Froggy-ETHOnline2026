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
 * Both are authenticated *and* origin-gated at upgrade. The token is what
 * decides whose workspace the socket is attached to; the origin check is a
 * second, weaker fence — a WebSocket upgrade bypasses CORS entirely, so
 * without it a hostile page could at least try tokens it had stolen.
 *
 * Everything published here is addressed to one user. A broadcast to every
 * open socket is what the single-session build did, and on a multi-user
 * process it would hand one person another person's receipts.
 */

import type { UserId } from "@froggy/domain";
import {
  decodeAppClientMessage,
  decodeBrowserClientMessage,
  encodeAppServerMessage,
  encodeBrowserServerMessage,
} from "@froggy/protocol";
import type { AppServerMessage, BrowserState } from "@froggy/protocol";
import { Result } from "effect";

import type { AgentGrants } from "./grants";
import type { ChatRunRegistry } from "./runs";
import type { Services } from "./services";
import { BrowserLimitReachedError } from "./workspaces";
import type { Workspaces } from "./workspaces";

type SocketKind = "app" | "browser";

export interface SocketData {
  /**
   * The caller's Privy access token, kept for the life of the socket.
   *
   * Held rather than re-requested because freezing has to work at the moment
   * the button is pressed: revoking the agent's signer is a request Privy
   * requires the *user* to authorize, and a round trip to fetch a fresh token
   * first is a round trip during which the agent can still sign.
   */
  accessToken: string;
  kind: SocketKind;
  /** Established at upgrade from a verified Privy token. Never client-supplied. */
  userId: UserId;
}

type Socket = Bun.ServerWebSocket<SocketData>;

/**
 * Frames dropped above this. Roughly three frames at quality 60 of 1280×800 —
 * enough to ride out a hiccup, small enough that a stalled client does not
 * accumulate seconds of stale video to deliver when it recovers.
 */
const MAX_BUFFERED_BYTES = 512 * 1024;

export interface SocketDeps {
  readonly grants: AgentGrants;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly workspaces: Workspaces;
}

/**
 * A missing `Origin` is refused.
 *
 * The earlier version allowed it, reasoning that browsers always send one so
 * absence meant a harmless non-browser client. That had the threat model
 * backwards: the attacker here is a script, not a browser, and a script simply
 * omits the header. Allowing absence made the allowlist decorative — which is
 * exactly how the deployed instance ended up drivable by `curl`.
 *
 * Legitimate non-browser clients authenticate with a token and are refused
 * here anyway; that is the intended trade. This is a second fence, not the
 * fence.
 */
export const isTrustedOrigin = (
  origin: string | null,
  allowed: readonly string[]
): boolean => origin !== null && allowed.includes(origin);

const sendApp = (socket: Socket, message: AppServerMessage): void => {
  socket.send(encodeAppServerMessage(message));
};

export const createSocketHandlers = (deps: SocketDeps) => {
  const appSockets = new Set<Socket>();
  const browserSockets = new Set<Socket>();
  const unsubscribes = new WeakMap<Socket, () => void>();

  /** To this user's app sockets — their laptop and their phone, nobody else's. */
  const publishApp = (userId: UserId, message: AppServerMessage): void => {
    const encoded = encodeAppServerMessage(message);
    for (const socket of appSockets) {
      if (socket.data.userId === userId) {
        socket.send(encoded);
      }
    }
  };

  const publishBrowserState = (userId: UserId, state: BrowserState): void => {
    // Browser state is small JSON on the *browser* socket, alongside the frames
    // it describes, so a tab list can never arrive before the frame it belongs to.
    const encoded = encodeBrowserServerMessage({
      state,
      type: "browser.state",
      v: 1,
    });
    for (const socket of browserSockets) {
      if (socket.data.userId === userId) {
        socket.send(encoded);
      }
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
      deps.workspaces.for(ws.data.userId).browser.resendLatest({
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
        const workspace = deps.workspaces.for(ws.data.userId);
        if (message.type === "browser.take") {
          // Abort first, *then* take the page. Flipping only the gate buys 1.5
          // seconds before the next queued tool call grabs it straight back,
          // which looks exactly like the button not working. Only this user's
          // run is aborted — one person hitting Take must not stop everyone.
          deps.runs.abort(workspace.session.id);
        }
        try {
          // The cap is checked here rather than inside the session, because
          // this is the boundary where a refusal can still be turned into
          // something the pane renders.
          deps.workspaces.admitBrowser(ws.data.userId);
          await workspace.browser.handleClientMessage(message);
        } catch (error) {
          if (error instanceof BrowserLimitReachedError) {
            publishBrowserState(ws.data.userId, {
              ...workspace.browser.state(),
              error: error.message,
            });
            return;
          }
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
          const workspace = deps.workspaces.for(ws.data.userId);
          // Local first, and synchronously. This is the layer our own policy
          // engine reads, and it must never wait on a network call — a freeze
          // that takes a round trip is a freeze the agent can outrun.
          const mandate = workspace.session.setFrozen(message.frozen);
          // Freezing stops the turn as well as the spending. Stopping only the
          // spending would leave the agent running against a wallet it can no
          // longer use, narrating failures. It stops *this* user's turn: a
          // freeze is a statement about one wallet.
          if (message.frozen) {
            deps.runs.abort(workspace.session.id);
            // Then the outer layer: take the signature away at Privy, so the
            // agent could not sign even if every check in our code were
            // bypassed. Allowed to fail — a stale token is ordinary — as long
            // as the pane says so rather than claiming a revocation happened.
            void deps.grants.revoke(ws.data.userId, ws.data.accessToken);
          } else {
            deps.grants.note(ws.data.userId, ws.data.accessToken);
          }
          publishApp(ws.data.userId, { mandate, type: "mandate.state", v: 1 });
          return;
        }
        case "mandate.update": {
          const mandate = deps.workspaces
            .for(ws.data.userId)
            .session.updateMandate(message.mandate);
          publishApp(ws.data.userId, { mandate, type: "mandate.state", v: 1 });
          return;
        }
        case "approval.resolve": {
          publishApp(ws.data.userId, {
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
      const workspace = deps.workspaces.for(ws.data.userId);
      if (ws.data.kind === "app") {
        appSockets.add(ws);
        sendApp(ws, {
          modes: deps.services.environment.modes,
          sessionId: workspace.session.id,
          type: "session.welcome",
          v: 1,
        });
        sendApp(ws, {
          mandate: workspace.session.currentMandate,
          type: "mandate.state",
          v: 1,
        });
        void (async () => {
          const wallet = await workspace.session.walletSummary();
          sendApp(ws, { type: "wallet.state", v: 1, wallet });
        })();
        return;
      }

      browserSockets.add(ws);
      // Chrome is not started here. Opening the pane should cost nothing until
      // someone actually asks for a page; the state below says "idle" and the
      // pane renders its start button from it.
      ws.send(
        encodeBrowserServerMessage({
          state: workspace.browser.state(),
          type: "browser.state",
          v: 1,
        })
      );
      unsubscribes.set(
        ws,
        workspace.browser.subscribe({
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

  return { handlers, publishApp, publishBrowserState };
};
