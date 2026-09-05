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
import { WS_PROTOCOL } from "@froggy/protocol";
import { Context, Effect, Layer } from "effect";

import { authenticate, bearerFromProtocols } from "./auth";
import { describeModes, loadEnvironment } from "./environment";
import { handleRequest, ORACLE_PATH } from "./router";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import { createSocketHandlers, isTrustedOrigin } from "./sockets";
import type { SocketData } from "./sockets";
import { Workspaces } from "./workspaces";

class FroggyServer extends Context.Service<
  FroggyServer,
  { readonly url: string }
>()("froggy/server/FroggyServer") {
  static readonly layer = Layer.effect(
    FroggyServer,
    Effect.gen(function* layer() {
      const environment = yield* loadEnvironment();

      const runs = new ChatRunRegistry();
      const services = createServices({ environment });
      const oracleUrl = `${environment.appOrigin}${ORACLE_PATH}`;

      /**
       * Workspaces publish (a decision, a receipt, a browser frame) and sockets
       * subscribe — but a socket needs a workspace to read a mandate from, so
       * the two would otherwise have to reference each other before either
       * exists. A pair of sinks, filled in once the sockets are built, breaks
       * that without a cast or a forward reference.
       */
      const sinks: Partial<
        Pick<
          ReturnType<typeof createSocketHandlers>,
          "publishApp" | "publishBrowserState"
        >
      > = {};

      const workspaces = new Workspaces({
        ledger: services.ledger,
        maxBrowsers: environment.maxBrowsers,
        modes: environment.modes,
        onBrowserState: (userId, state) => {
          sinks.publishBrowserState?.(userId, state);
        },
        onPolicyDecision: (userId, decision) => {
          sinks.publishApp?.(userId, {
            decision,
            type: "policy.decision",
            v: 1,
          });
        },
        onReceipt: (userId, receipt) => {
          sinks.publishApp?.(userId, {
            receipt,
            type: "receipt.appended",
            v: 1,
          });
        },
        // The server's own oracle is on every mandate's allowlist from the
        // first moment, so there is never a window where an allowlist exists
        // but is empty and therefore means nothing.
        oracleHost: new URL(oracleUrl).host,
        oraclePayTo: services.oracle.payTo,
        profileRoot: environment.chromeProfileDirectory,
      });

      const sockets = createSocketHandlers({ runs, services, workspaces });
      sinks.publishApp = sockets.publishApp;
      sinks.publishBrowserState = sockets.publishBrowserState;

      const routerDeps = {
        environment,
        oracleUrl,
        runs,
        services,
        workspaces,
      };

      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve<SocketData>({
            fetch(
              request,
              bunServer
            ): Promise<Response | undefined> | Response | undefined {
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
              // Async, so the upgrade is returned as a promise. Bun accepts
              // that: the socket is not established until this resolves, and
              // the token is verified against a cached JWKS with no network
              // call, so the wait is microseconds.
              return authenticate(services, bearerFromProtocols(request)).then(
                (userId) => {
                  if (userId === null) {
                    return new Response("Sign in to use this.", {
                      status: 401,
                    });
                  }
                  const kind = pathname === "/ws/app" ? "app" : "browser";
                  return bunServer.upgrade(request, {
                    data: { kind, userId },
                    // Echoed so the browser's `WebSocket` accepts the handshake:
                    // a client that offered subprotocols requires the server to
                    // select one of them. Never the token — the client knows it.
                    headers: { "sec-websocket-protocol": WS_PROTOCOL },
                  })
                    ? undefined
                    : new Response("Upgrade failed.", { status: 400 });
                }
              );
            },
            port: environment.port,
            websocket: sockets.handlers,
          })
        ),
        (running) =>
          Effect.promise(async () => {
            await running.stop(true);
            workspaces.closeAll();
            await services.shutdown();
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
