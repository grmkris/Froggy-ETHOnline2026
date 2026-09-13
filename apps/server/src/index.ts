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
import { Config, Context, Effect, Layer } from "effect";

import { authenticate, bearerFromProtocols } from "./auth";
import { ModelBudget } from "./budget";
import { createConversion } from "./conversion";
import { detached } from "./detached";
import {
  describeModes,
  describeTradingModes,
  loadEnvironment,
} from "./environment";
import { AgentGrants } from "./grants";
import type { GrantDeps } from "./grants";
import { recordHistoryWait } from "./history-sources";
import {
  controlCurrentHostedBrowse,
  hasHostedBrowse,
  hostedBrowseBusy,
  hostedBrowseFor,
  recoverHostedBrowses,
  subscribeHostedBrowses,
  suspendHostedBrowses,
} from "./hosted-browse";
import { InteractionRegistry } from "./interactions";
import { digestJob, promptJob, runScheduledFor } from "./jobs";
import { createNotices } from "./notices";
import { PersonPolicies } from "./person-policies";
import { createQuotes } from "./quotes";
import { handleRequest, ORACLE_PATH } from "./router";
import type { RouterDeps } from "./router";
import { ChatRunRegistry } from "./runs";
import { createScheduleTicker, formatLocal } from "./schedules";
import { cspModeOf, withSecurityHeaders } from "./security-headers";
import { recoverOrphanedServiceTasks } from "./service-tasks";
import { createServices } from "./services";
import { createSocketHandlers, isTrustedOrigin } from "./sockets";
import type { SocketData, SocketDeps } from "./sockets";
import { resumeBrowseTask } from "./tasks";
import { liveTelegramPager, stubTelegramPager } from "./telegram/pager";
import type { TelegramPager } from "./telegram/pager";
import { LaunchReactor } from "./trading/reactions";
import { createTradeRecovery } from "./trading/recovery";
import { UnlockTokens } from "./unlock";
import { chainIdHex } from "./wallet-call";
import { WalletRequests } from "./wallet-requests";
import { Workspaces } from "./workspaces";

/** How often idle browsers are looked for. Coarse on purpose; nothing waits on it. */
const SWEEP_INTERVAL_MS = 60_000;
/** The schedule clock. A minute: the finest grain a cadence can name. */
const SCHEDULE_TICK_MS = 60_000;

interface WalletCoordinatorBox {
  current: WalletRequests | null;
}

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
      if (environment.modes.privy === "live") {
        // The RPC must be on the Base EVM_NETWORK names: a URL for the other
        // Base would sign every transfer with the wrong chain id. Checked
        // only when transfers are possible, so a stub boot works offline.
        const chainId = yield* Effect.promise(
          async () => await services.evmChainId()
        );
        if (chainId !== environment.evmChainId) {
          throw new Error(
            `EVM_RPC_URL answers chain ${chainId}, but EVM_NETWORK ${environment.evmNetwork} is chain ${environment.evmChainId}.`
          );
        }
      }
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
        > & { pager: TelegramPager }
      > = {};

      // Fetched here at boot, so the first payment is not the first time
      // anyone asks what an HBAR is worth, and re-read on the schedule clock
      // below. A failure here is not fatal: the quote is simply null and
      // spends in HBAR are refused until a read lands.
      const rateReady = yield* Effect.promise(
        async () => await services.rates.refresh()
      );
      if (!rateReady) {
        yield* Effect.logWarning(
          "Could not read the HBAR/USD rate. HBAR spends will be refused until it does."
        );
      }
      // The facilitator's fee payer. Hedera's exact scheme cannot build a
      // payment without it, so a 402 that omits it is a 402 nobody can pay.
      // Read rather than hardcoded: it has already changed once.
      const feePayerReady = yield* Effect.promise(
        async () => await services.oracle.refresh()
      );
      if (!feePayerReady) {
        yield* Effect.logWarning(
          "Could not read the facilitator's fee payer. The paid endpoint will advertise a 402 nobody can pay."
        );
      }
      // The audit topic. Created at first use when none is configured, so a
      // fresh deployment still leaves a trail; the log says which topic.
      const topic = yield* Effect.promise(
        async () => await services.hcs.ensure()
      );
      if (services.hcs.mode === "live") {
        yield* Effect.log(
          topic === null
            ? "No HCS topic could be created; settlements will not be noted publicly."
            : `Settlements are noted on HCS topic ${topic}.`
        );
      }
      const quotes = createQuotes(services.rates);
      const unsubscribeHistory = services.store.history.subscribe(
        (userId, sequence) => {
          sinks.publishApp?.(userId, {
            v: 1,
            type: "history.changed",
            sequence,
          });
        }
      );
      yield* Effect.addFinalizer(() => Effect.sync(unsubscribeHistory));

      const interactions = new InteractionRegistry({
        onRequest: (userId, request) => {
          sinks.publishApp?.(userId, {
            request,
            type: "approval.request",
            v: 1,
          });
        },
        onResolved: (userId, requestId) => {
          sinks.publishApp?.(userId, {
            requestId,
            type: "approval.resolved",
            v: 1,
          });
        },
      });

      const walletBox: WalletCoordinatorBox = { current: null };

      const workspaces = new Workspaces({
        // The card goes up through the registry; "stop the agent" is the one
        // answer that does more than resolve the spend: it aborts the run and
        // withdraws every other open card, here rather than in the session so
        // the session never learns what a run is.
        ask: async (userId, input) => {
          // The same question, on the phone too, with the same four answers.
          await recordHistoryWait(
            services.store.history,
            userId,
            input.request,
            null
          );
          sinks.pager?.postApproval(userId, input.request);
          const outcome = await interactions.park({ ...input, userId });
          await recordHistoryWait(
            services.store.history,
            userId,
            input.request,
            outcome.kind === "answered" ? outcome.optionId : outcome.kind
          );
          if (outcome.kind === "answered" && outcome.optionId === "deny_stop") {
            if (
              hasHostedBrowse(userId) &&
              input.request.runId === hostedBrowseFor(userId)?.id
            ) {
              await controlCurrentHostedBrowse(userId, "stop");
            } else {
              runs.abort(workspaces.for(userId).session.id);
              if (input.request.runId !== undefined) {
                interactions.abortRun(
                  userId,
                  input.request.runId,
                  "Stopped from the approval card."
                );
              }
            }
          }
          return outcome;
        },
        blockPrivateNetwork: environment.blockPrivateNetwork,
        blockedUrls: [`*://${new URL(environment.appOrigin).host}*`],
        browserIdleMs: environment.browserIdleMs,
        createBrowser: services.createBrowser,
        demoUserId: environment.demoUserId,
        isBusy: (sessionId) =>
          runs.get(sessionId) !== null || hostedBrowseBusy(sessionId),
        ledger: services.ledger,
        maxBrowsers: environment.maxBrowsers,
        modes: environment.modes,
        onBrowserPayment: (userId, request) => {
          detached("browser purchase", async () => {
            const workspace = await workspaces.hydrate(userId);
            const run = hasHostedBrowse(userId)
              ? hostedBrowseFor(userId)
              : runs.get(workspace.session.id);
            await services.purchases.observe(
              {
                session: workspace.session,
                browser: workspace.browser,
                source: "browser",
                run: run ?? undefined,
              },
              request
            );
          });
        },
        onWalletCall: (userId, observation) => {
          detached("wallet call", async () => {
            const coordinator = walletBox.current;
            if (coordinator === null) {
              return;
            }
            await coordinator.observe(userId, observation);
          });
        },
        onBrowserState: (userId, state) => {
          sinks.publishBrowserState?.(userId, state);
        },
        onMandate: (userId, mandate) => {
          sinks.publishApp?.(userId, { mandate, type: "mandate.state", v: 1 });
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
          // The strip's "spent so far" follows every receipt, rather than
          // waiting for the next socket to open. Not awaited: a slow ledger
          // read must not hold up the receipt it is describing.
          detached("wallet after receipt", async () => {
            const wallet = await workspaces.for(userId).session.walletSummary();
            sinks.publishApp?.(userId, { type: "wallet.state", v: 1, wallet });
          });
        },
        // The server's own oracle is on every mandate's allowlist from the
        // first moment, so there is never a window where an allowlist exists
        // but is empty and therefore means nothing.
        balances: services.balances,
        networks: {
          evm: environment.evmNetwork,
          hedera: environment.hederaNetwork,
        },
        oracleHost: new URL(oracleUrl).host,
        oraclePayTo: services.oracle.payTo,
        // When a person's HBAR runs short, their USDC becomes HBAR on the
        // spot: the treasury takes the USDC, the float funds their account.
        convert: createConversion(services),
        // The Hedera leg is paid from one host account; each person spends
        // their share of it, credited once and topped up under the policy.
        pocket: {
          networks: [environment.hederaNetwork],
          // The team and the demo account get a starting credit so they can
          // test without paying first; everyone else starts at what
          // POCKET_STARTING_USD says, which is zero on mainnet.
          startingUsdMicrosFor: (userId) =>
            environment.startingCreditDids.includes(userId)
              ? environment.teamStartingUsdMicros
              : environment.pocketStartingUsdMicros,
        },
        quote: quotes.quote,
        reservedBrowsers: environment.reservedBrowsers,
        spendingLimits: environment.spendingLimits,
        store: services.store,
        treasuryPayee: environment.treasuryEvmAddress,
        walletChainIdHex: chainIdHex(environment.evmChainId),
      });

      // Null until a payee and a treasury are configured: with nothing to pin,
      // a person's policy would carry no rules, and a policy with no rules is a
      // wallet the agent cannot sign for at all. Everyone stays on the app-wide
      // policy until then, and the pane says which one they are on.
      const policies =
        environment.personPolicyPins === null
          ? undefined
          : new PersonPolicies({
              pins: environment.personPolicyPins,
              privy: services.privy,
              store: services.store,
            });

      const grantDeps: GrantDeps = {
        privy: services.privy,
        publishApp: (userId, message) => {
          sinks.publishApp?.(userId, message);
        },
        workspaces,
      };
      const grants = new AgentGrants(
        policies === undefined ? grantDeps : { ...grantDeps, policies }
      );

      const walletRequests = new WalletRequests({
        browserRun: (userId) => hostedBrowseFor(userId),
        appOrigin: environment.appOrigin,
        ask: async (userId, input) => {
          await recordHistoryWait(
            services.store.history,
            userId,
            input.request,
            null
          );
          sinks.pager?.postApproval(userId, input.request);
          const outcome = await interactions.park({ ...input, userId });
          await recordHistoryWait(
            services.store.history,
            userId,
            input.request,
            outcome.kind === "answered" ? outcome.optionId : outcome.kind
          );
          if (outcome.kind === "answered" && outcome.optionId === "deny_stop") {
            if (
              hasHostedBrowse(userId) &&
              input.request.runId === hostedBrowseFor(userId)?.id
            ) {
              await controlCurrentHostedBrowse(userId, "stop");
            } else {
              runs.abort(workspaces.for(userId).session.id);
              if (input.request.runId !== undefined) {
                interactions.abortRun(
                  userId,
                  input.request.runId,
                  "Stopped from the approval card."
                );
              }
            }
          }
          return outcome;
        },
        chainId: environment.evmChainId,
        interactions,
        network: environment.evmNetwork,
        policies: policies ?? null,
        privy: services.privy,
        publish: (userId, message) => {
          sinks.publishApp?.(userId, message);
        },
        reads: services.evmReads,
        rpc: services.evmRpc,
        store: services.store,
        stubbed:
          environment.modes.privy === "stub" ||
          environment.modes.database === "stub",
        workspace: (userId) => workspaces.existing(userId),
      });
      walletBox.current = walletRequests;

      // Turns and steps per person per day; the demo account is exempt so a
      // judge mid-recording is never told to come back tomorrow.
      const budget = new ModelBudget({
        exempt: environment.demoUserId,
        runsPerDay: environment.modelRunsPerDay,
        stepsPerDay: environment.modelStepsPerDay,
      });

      // One-time links to the pages payments unlock, opened by the shared Chrome.
      const unlocks = new UnlockTokens();

      const notices = createNotices({
        notify: async (userId, text) =>
          (await sinks.pager?.notify(userId, text)) ?? false,
        publishApp: (userId, message) => {
          sinks.publishApp?.(userId, message);
        },
      });

      const socketDeps: SocketDeps = {
        resumeBrowse: async (userId) => {
          await resumeBrowseTask(
            {
              budget,
              interactions,
              notices,
              oracleUrl,
              runs,
              services,
              tasksUrl: `${environment.appOrigin}/api/tasks`,
              unlocks,
              workspaces,
            },
            userId
          );
        },
        interactions,
        runs,
        services,
        workspaces,
      };
      const sockets = createSocketHandlers(
        policies === undefined ? socketDeps : { ...socketDeps, policies }
      );

      const unsubscribeBrowse = subscribeHostedBrowses(sockets.publishApp);
      yield* Effect.addFinalizer(() => Effect.sync(unsubscribeBrowse));
      yield* Effect.promise(async () => {
        await recoverHostedBrowses({
          budget,
          interactions,
          notices,
          oracleUrl,
          runs,
          services,
          tasksUrl: `${environment.appOrigin}/api/tasks`,
          unlocks,
          workspaces,
        });
      });

      // Browsers nobody is watching or driving are released on a slow clock.
      // The profile stays; only the process goes, so eight seats serve more
      // than eight people over an afternoon.
      const sweep = setInterval(() => {
        detached("idle browser sweep", async () => {
          await workspaces.sweepIdle();
        });
      }, SWEEP_INTERVAL_MS);
      sinks.publishApp = sockets.publishApp;
      sinks.publishBrowserState = sockets.publishBrowserState;

      // What the agent says unprompted: to the phone through the pager,
      // which is built next and needs these same notices for its own turns,
      // so the pager is reached through the sinks rather than by reference.

      // The pager. Live only with a bot token *and* a webhook secret; the
      // stub answers 404 and says so.
      const pager: TelegramPager =
        environment.modes.telegram === "live"
          ? liveTelegramPager({
              botToken: environment.telegramBotToken,
              botUsername: environment.telegramBotUsername,
              budget,
              unlocks,
              interactions,
              notices,
              oracleUrl,
              publishApp: sockets.publishApp,
              runs,
              services,
              webhookSecret: environment.telegramWebhookSecret,
              workspaces,
            })
          : stubTelegramPager();
      sinks.pager = pager;

      // Reminders, scheduled prompts and the digest, on one clock. A run
      // happens unattended, under the person's own mandate, with nobody to
      // ask; its report lands on the pager (a Telegram card when paired,
      // the log otherwise) and in the web stream as a notice.
      const jobDeps = {
        notices,
        oracleUrl,
        publishApp: sockets.publishApp,
        runs,
        services,
        sink: pager,
        unlocks,
        workspaces,
      };
      const ticker = createScheduleTicker({
        fire: async (userId, schedule) => {
          if (schedule.action._tag === "remind") {
            await notices.post(userId, {
              scheduleId: schedule.id,
              source: "reminder",
              text: schedule.action.text,
            });
            return "done";
          }
          const job =
            schedule.action._tag === "digest"
              ? digestJob(oracleUrl)
              : promptJob(schedule, oracleUrl);
          const report = await runScheduledFor(jobDeps, userId, job);
          return report.outcome === "skipped" ? "busy" : "done";
        },
        onMissed: async (userId, schedule, dueAt) => {
          await notices.post(userId, {
            scheduleId: schedule.id,
            source: "notify",
            text: `Missed schedule "${schedule.label}": it did not run at ${formatLocal(dueAt, schedule.timezone)}.`,
          });
        },
        store: services.store,
      });
      const scheduleTick = setInterval(() => {
        detached("schedule tick", async () => {
          await ticker.tick();
        });
      }, SCHEDULE_TICK_MS);

      // Telling people their agent is about to go quiet. The expiry itself
      // needs nothing to run — it is a condition on every Privy rule and an
      // expiry rule on the mandate — so a missed tick costs the warning, never
      // the leash. Rides the schedule clock rather than adding a second one.
      const nudgeTick = setInterval(() => {
        detached("policy expiry nudge", async () => {
          for (const due of (await policies?.dueForNudge(Date.now())) ?? []) {
            // Sequential: these go to Telegram, and a burst of parallel sends
            // is how a bot gets rate-limited into silence.
            // eslint-disable-next-line no-await-in-loop
            await notices.post(due.userId, {
              // `reminder` rather than `scheduled_run`: the latter is
              // suppressed on Telegram because its report already went as a
              // card, and this one has no card behind it. The phone is where
              // somebody who is not looking at Froggy will see it.
              source: "reminder",
              text: due.text,
            });
          }
        });
      }, SCHEDULE_TICK_MS);

      // The HBAR rate, re-read on the schedule clock. The network replaces
      // it hourly and the source refuses one a short grace past that, so a
      // rate read once at boot is a refusal by the next hour boundary. A
      // failed read keeps the held rate through the grace; the warning says
      // whether spends are still being priced.
      const rateTick = setInterval(() => {
        detached("HBAR rate refresh", async () => {
          const refreshed = await services.rates.refresh();
          const usable = services.rates.current(Date.now()) !== null;
          if (refreshed && usable) {
            return;
          }
          console.warn(
            `HBAR rate refresh ${refreshed ? "read a rate already past its grace" : "failed"}; ${usable ? "the held rate serves until it ages out" : "HBAR spends are being refused"}`
          );
        });
      }, SCHEDULE_TICK_MS);

      const reactions = new LaunchReactor({
        watches: services.store.launches,
        store: services.store.trading,
        trades: services.trades,
        sessionFor: async (owner) => {
          const workspace = await workspaces.hydrate(owner);
          return workspace.session;
        },
        now: Date.now,
      });
      const launchTick = setInterval(() => {
        detached("launch observation", async () => {
          await services.launches.tick();
          await reactions.tick();
        });
      }, 5000);
      detached("launch observation at startup", async () => {
        await services.launches.tick();
        await reactions.tick();
      });

      const tradeRecovery = createTradeRecovery({
        store: services.store.trading,
        recover: async (owner, id) => {
          await services.trades.get(owner, id, null);
        },
      });
      const tradeTick = setInterval(() => {
        detached("trade recovery", tradeRecovery.tick);
      }, 15_000);
      detached("trade recovery at startup", tradeRecovery.tick);
      detached("service task recovery at startup", async () => {
        await recoverOrphanedServiceTasks(services);
      });
      const emailTick = setInterval(() => {
        detached("email cleanup", async () => {
          await services.email?.maintain();
        });
      }, 60_000);
      detached("email cleanup at startup", async () => {
        await services.email?.maintain();
      });
      const walletTick = setInterval(() => {
        detached("wallet recovery", async () => {
          await walletRequests.recover();
        });
      }, 15_000);
      detached("wallet recovery at startup", async () => {
        await walletRequests.recover();
      });

      const baseRouterDeps: RouterDeps = {
        budget,
        environment,
        unlocks,
        grants,
        interactions,
        jobs: jobDeps,
        notices,
        oracleUrl,
        pager,
        publishApp: sockets.publishApp,
        runs,
        services,
        walletRequests,
        workspaces,
      };
      const routerDeps =
        policies === undefined
          ? baseRouterDeps
          : { ...baseRouterDeps, policies };

      // Privy's wallet iframe and nothing else may be framed; `CSP_MODE=report`
      // turns the policy into a report-only header without a code change.
      const cspMode = cspModeOf(
        yield* Config.string("CSP_MODE").pipe(Config.withDefault("enforce"))
      );
      const handleHttp = async (request: Request): Promise<Response> =>
        withSecurityHeaders(await handleRequest(routerDeps, request), cspMode);

      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve<SocketData>({
            fetch(
              request,
              bunServer
            ): Promise<Response | undefined> | Response | undefined {
              const { pathname } = new URL(request.url);
              // Mainnet settlement can outlast Bun's 10-second idle timeout.
              // Keep the response open while the server-owned operation finishes.
              if (
                pathname === ORACLE_PATH ||
                pathname === "/mcp" ||
                pathname.startsWith("/api/")
              ) {
                bunServer.timeout(request, 180);
              }
              if (pathname !== "/ws/app" && pathname !== "/ws/browser") {
                return handleHttp(request);
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
              const token = bearerFromProtocols(request);
              return authenticate(services, token).then((userId) => {
                if (userId === null || token === null) {
                  return new Response("Sign in to use this.", {
                    status: 401,
                  });
                }
                grants.note(userId, token);
                const kind = pathname === "/ws/app" ? "app" : "browser";
                return bunServer.upgrade(request, {
                  data: { accessToken: token, kind, userId },
                  // Echoed so the browser's `WebSocket` accepts the handshake:
                  // a client that offered subprotocols requires the server to
                  // select one of them. Never the token — the client knows it.
                  headers: { "sec-websocket-protocol": WS_PROTOCOL },
                })
                  ? undefined
                  : new Response("Upgrade failed.", { status: 400 });
              });
            },
            port: environment.port,
            websocket: sockets.handlers,
          })
        ),
        (running) =>
          Effect.promise(async () => {
            clearInterval(sweep);
            clearInterval(scheduleTick);
            clearInterval(nudgeTick);
            clearInterval(rateTick);
            clearInterval(launchTick);
            await services.launches.close();
            await reactions.close();
            clearInterval(tradeTick);
            await tradeRecovery.close();
            clearInterval(emailTick);
            clearInterval(walletTick);
            await running.stop(true);
            const preserved = await suspendHostedBrowses();
            await workspaces.closeAll(preserved);
            await services.shutdown();
          })
      );

      yield* Effect.log(
        `Froggy listening on ${server.url.toString()} — ${describeModes(environment.modes)} ${describeTradingModes(environment.trading)}`
      );

      return FroggyServer.of({ url: server.url.toString() });
    })
  );
}

BunRuntime.runMain(Layer.launch(FroggyServer.layer));
