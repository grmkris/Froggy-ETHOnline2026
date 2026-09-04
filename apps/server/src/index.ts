/**
 * The Froggy server: one Bun process, one origin.
 *
 * It serves the SPA, the JSON API, both WebSockets, the paid oracle endpoint,
 * and it owns the Chrome the agent drives. One origin means no CORS, no
 * internal network hop for a binary screencast, and one fewer thing to debug on
 * the last day — which is why this deviates from the house pattern of a Caddy
 * gateway in front of separate services.
 *
 * Effect owns the lifecycle: configuration through `Config`, the server as an
 * acquired resource so Chrome and the socket are released together.
 */

import { BunRuntime } from "@effect/platform-bun";
import { SessionId } from "@froggy/domain";
import type { AppServerMessage, BrowserState } from "@froggy/protocol";
import { Context, Effect, Layer } from "effect";

import { describeModes, loadEnvironment } from "./environment";
import { handleRequest, ORACLE_PATH } from "./router";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";
import { createSocketHandlers, isTrustedOrigin } from "./sockets";
import type { SocketData } from "./sockets";

class FroggyServer extends Context.Service<
  FroggyServer,
  { readonly url: string }
>()("froggy/server/FroggyServer") {
  static readonly layer = Layer.effect(
    FroggyServer,
    Effect.gen(function* layer() {
      const environment = yield* loadEnvironment();

      const runs = new ChatRunRegistry();
      // One session per process. This is a hackathon build with a single
      // workspace; the multi-tenant version keys these by the Privy DID and
      // changes nothing else, which is why the session is already an object
      // rather than a pile of module state.
      const sessionId = SessionId.generate();

      /**
       * The session publishes decisions and receipts, and the browser publishes
       * its state — but the sockets that carry them need the session to read a
       * mandate from, so the two would otherwise have to reference each other
       * before either exists. A pair of sinks, registered once the sockets are
       * built, breaks that without a cast or a forward reference.
       */
      const appSinks: ((message: AppServerMessage) => void)[] = [];
      const browserSinks: ((state: BrowserState) => void)[] = [];
      const publishApp = (message: AppServerMessage): void => {
        for (const sink of appSinks) {
          sink(message);
        }
      };

      const services = createServices({
        environment,
        onBrowserStateChange: (state) => {
          for (const sink of browserSinks) {
            sink(state);
          }
        },
      });

      const oracleUrl = `${environment.appOrigin}${ORACLE_PATH}`;
      const session = new WorkspaceSession(
        sessionId,
        {
          ledger: services.ledger,
          modes: environment.modes,
          onPolicyDecision: (decision) => {
            publishApp({ decision, type: "policy.decision", v: 1 });
          },
          onReceipt: (receipt) => {
            publishApp({ receipt, type: "receipt.appended", v: 1 });
          },
        },
        {
          // The server's own oracle is on the allowlist from the first moment,
          // so there is never a window where an allowlist exists but is empty
          // and therefore means nothing.
          hosts: [new URL(oracleUrl).host],
          payeeIds: [services.oracle.payTo],
        }
      );

      const sockets = createSocketHandlers({ runs, services, session });
      appSinks.push(sockets.broadcastApp);
      browserSinks.push(sockets.broadcastBrowserState);

      const routerDeps = {
        environment,
        oracleUrl,
        runs,
        services,
        session,
        sessionId,
      };

      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve<SocketData>({
            fetch(
              request,
              bunServer
            ): Promise<Response> | Response | undefined {
              const { pathname } = new URL(request.url);
              if (pathname !== "/ws/app" && pathname !== "/ws/browser") {
                return handleRequest(routerDeps, request);
              }
              // A WebSocket upgrade bypasses CORS entirely, and the browser
              // socket types into a Chrome logged into the user's sites — so
              // the origin is checked here or nowhere.
              if (
                !isTrustedOrigin(
                  request.headers.get("origin"),
                  environment.allowedOrigins
                )
              ) {
                return new Response("Untrusted origin.", { status: 403 });
              }
              const kind = pathname === "/ws/app" ? "app" : "browser";
              return bunServer.upgrade(request, { data: { kind } })
                ? undefined
                : new Response("Upgrade failed.", { status: 400 });
            },
            port: environment.port,
            websocket: sockets.handlers,
          })
        ),
        (running) =>
          Effect.promise(async () => {
            await running.stop(true);
            services.browser.close();
          })
      );

      yield* Effect.log(
        `Froggy listening on ${server.url.toString()} — ${describeModes(environment.modes)}`
      );

      return FroggyServer.of({ url: server.url.toString() });
    })
  );
}

BunRuntime.runMain(Layer.launch(FroggyServer.layer));
