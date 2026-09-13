/**
 * Telegram, as a pager and a second mouth.
 *
 * One bot, one DM per person. It carries the daily digest, puts approval
 * questions in front of the person with the same four answers as the web
 * ticket, stops on request, and — because the loop is the same loop —
 * lets the person talk to the agent from their phone. A turn started here
 * runs on the same session, under the same mandate, in the same run
 * registry, so the web app can see it and a stop from either side ends it.
 *
 * Nothing here is reachable without a pairing: a Telegram account becomes
 * somebody's only through a code they minted while signed in, and every
 * message and button is looked up against that pairing before it does
 * anything. The stub answers 404 and says so, so a deployment without a bot
 * token never looks like one with a bot that is silently ignoring people.
 */

import {
  AdapterRateLimitError,
  AuthenticationError,
  PermissionError,
  ResourceNotFoundError,
  ValidationError,
} from "@chat-adapter/shared";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import type { TelegramAdapterConfig } from "@chat-adapter/telegram";
import { MessageId, NoticeId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { AppServerMessage, ApprovalRequest } from "@froggy/protocol";
import type { WalletAlert } from "@froggy/wallet";
import { HistoryConflictError } from "@froggy/wallet";
import type { UIMessage } from "ai";
import { Chat } from "chat";
import type { Thread } from "chat";

import { ModelBudgetExhaustedError } from "../budget";
import type { ModelBudget } from "../budget";
import { detached } from "../detached";
import { HistoryDuplicateError } from "../history";
import {
  recoverTelegramHistory,
  recordTelegramQueued,
  recordTelegramIntent,
  recordTelegramDelivery,
} from "../history-sources";
import type { InteractionRegistry } from "../interactions";
import type { JobReport, ReportSink } from "../jobs";
import type { Notices } from "../notices";
import type { ChatRunRegistry } from "../runs";
import type { Services } from "../services";
import { recordTurn, sseOf, startTurn } from "../turn";
import type { UnlockTokens } from "../unlock";
import type { WalletAlertDelivery } from "../wallet-monitor-worker";
import type { Workspaces } from "../workspaces";
import {
  APPROVAL_ACTION,
  approvalCard,
  pairedCard,
  parseApprovalValue,
  reportCard,
} from "./cards";
import { PairingCodes } from "./pairing";

export interface TelegramPager extends ReportSink {
  readonly codes: PairingCodes;
  readonly shutdown: () => Promise<void>;
  /** The deep link a person opens to pair, given a fresh code. */
  readonly link: (code: string) => string | null;
  readonly mode: "live" | "stub";
  /**
   * A plain message to the person's paired chat, unprompted. True when it
   * was paired and posted; false is the honest answer everywhere else, and
   * the caller says "shown in the web stream only" on the strength of it.
   */
  readonly notify: (userId: UserId, text: string) => Promise<boolean>;
  readonly deliverWalletAlert: (
    alert: WalletAlert
  ) => Promise<WalletAlertDelivery>;
  /** An approval question, to the person's paired chat if they have one. */
  readonly postApproval: (userId: UserId, request: ApprovalRequest) => void;
  readonly webhook: (request: Request) => Promise<Response>;
}

export const stubTelegramPager = (): TelegramPager => ({
  codes: new PairingCodes(),
  shutdown: async () => {
    await Promise.resolve();
  },
  deliverWalletAlert: async () => await Promise.resolve({ kind: "not_paired" }),
  deliver: async (report: JobReport) => {
    await Promise.resolve();
    console.info(
      `[report] ${report.userId} "${report.title}" ${report.outcome}: ${report.summary || "(no summary)"} — spent $${(report.spentUsdMicros / 1_000_000).toFixed(4)} over ${report.receipts.length} receipt(s)`
    );
  },
  link: () => null,
  mode: "stub",
  notify: async (userId, text) => {
    await Promise.resolve();
    console.info(`[notify] ${userId}: ${text}`);
    return false;
  },
  postApproval: (): void => undefined,
  webhook: async () =>
    await Promise.resolve(
      Response.json(
        { error: "Telegram is not configured on this deployment." },
        { status: 404 }
      )
    ),
});

export interface LivePagerDeps {
  readonly botToken: string;
  readonly botUsername: string;
  /** Turns and steps per person per day, shared with the web chat. */
  readonly budget: ModelBudget;
  readonly interactions: InteractionRegistry;
  /** For the `notify` tool inside a turn started here. */
  readonly notices: Notices;
  readonly oracleUrl: string;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly unlocks: UnlockTokens;
  readonly webhookSecret: string;
  readonly workspaces: Workspaces;
}

const NOT_PAIRED =
  "This chat is not paired with a Froggy account yet. Open Froggy, go to Connect an agent → Telegram, and send the code here as /start CODE.";

export const liveTelegramPager = (deps: LivePagerDeps): TelegramPager => {
  const { store } = deps.services;
  const codes = new PairingCodes();

  const adapterConfig: TelegramAdapterConfig = {
    botToken: deps.botToken,
    mode: "webhook",
    secretToken: deps.webhookSecret,
  };
  if (deps.botUsername !== "") {
    adapterConfig.userName = deps.botUsername;
  }
  const bot = new Chat({
    adapters: {
      // The SDK's own types disagree with themselves under
      // `exactOptionalPropertyTypes`: `Adapter.botUserId?: string` versus the
      // Telegram adapter's `botUserId?: string | undefined`. Nothing here is
      // being narrowed or widened, so this is not a cast; it is one line the
      // SDK's next release removes. Recorded in docs/decisions/0007.
      // @ts-expect-error TS2375 — exactOptionalPropertyTypes mismatch inside chat@4.40.0
      telegram: createTelegramAdapter(adapterConfig),
    },
    // A person mid-turn who writes again: the second message waits for the
    // first, rather than being dropped on the floor.
    concurrency: "queue",
    state:
      deps.services.environment.modes.database === "live"
        ? createPostgresState({
            keyPrefix: "froggy-telegram",
            url: deps.services.environment.databaseUrl,
          })
        : createMemoryState(),
    userName: deps.botUsername === "" ? "froggy" : deps.botUsername,
  });

  let ready: Promise<void> | null = null;
  const initialize = async (): Promise<void> => {
    try {
      await bot.initialize();
    } catch (error) {
      // Chat caches a rejected startup promise. Reset it after disconnecting so
      // a definitely-unsent retry can recover from a transient state-store error.
      try {
        await bot.shutdown();
      } finally {
        ready = null;
      }
      throw error;
    }
  };
  const ensureReady = async (): Promise<void> => {
    ready ??= initialize();
    await ready;
  };

  const whose = async (telegramUserId: string): Promise<UserId | null> =>
    await store.telegram.lookup(telegramUserId);

  const postTo = async (
    userId: UserId,
    message: Parameters<Thread["post"]>[0],
    text: string
  ): Promise<void> => {
    const pairing = await store.telegram.forUser(userId);
    if (pairing === null) {
      return;
    }
    await ensureReady();
    const intent = await recordTelegramIntent(
      store,
      userId,
      pairing.threadId,
      text
    );
    try {
      const sent = await bot.thread(pairing.threadId).post(message);
      await recordTelegramDelivery(store.history, userId, intent, sent.id);
    } catch (error) {
      await recordTelegramDelivery(store.history, userId, intent, null);
      throw error;
    }
  };

  bot.onSlashCommand("/start", async (event) => {
    const userId = codes.redeem(event.text);
    const thread = await bot.openDM(event.user.userId);
    if (userId === null) {
      await thread.post(NOT_PAIRED);
      return;
    }
    await store.telegram.pair(userId, {
      since: Date.now(),
      telegramUserId: event.user.userId,
      threadId: thread.id,
    });
    await thread.post(pairedCard());
  });

  bot.onAction(APPROVAL_ACTION, async (event) => {
    const userId = await whose(event.user.userId);
    const answer = parseApprovalValue(event.value);
    if (userId === null || answer === null) {
      return;
    }
    // The registry checks the card is this user's; a stale tap is ignored.
    const taken = deps.interactions.resolve(
      userId,
      answer.requestId,
      answer.optionId,
      null
    );
    if (answer.optionId === "deny_stop" && taken) {
      // "Stop the agent": the run ends and every other open card is withdrawn.
      const workspace = await deps.workspaces.hydrate(userId);
      deps.runs.abort(workspace.session.id);
      deps.interactions.abortAll(userId, "stopped from Telegram");
    }
    await event.thread?.post(
      taken ? "Noted." : "That question has already been answered."
    );
  });

  bot.onDirectMessage(async (thread, message, _channel, context) => {
    // Commands arrive here too; they have their own handlers above.
    if (message.text.startsWith("/")) {
      return;
    }
    const userId = await whose(message.author.userId);
    if (userId === null) {
      await thread.post(NOT_PAIRED);
      return;
    }
    const workspace = await deps.workspaces.hydrate(userId);
    await recoverTelegramHistory(store, userId, `tg-${message.id}`);
    await recordTelegramQueued(
      store,
      userId,
      (context?.skipped ?? [])
        .filter(
          (queued) =>
            queued.author.userId === message.author.userId &&
            queued.id !== message.id
        )
        .map((queued) => ({
          id: queued.id,
          text: queued.text,
          threadId: thread.id,
          author: { isMe: false },
          metadata: { dateSent: queued.metadata.dateSent.toISOString() },
        }))
    );
    const incoming: UIMessage = {
      id: `tg-${message.id}`,
      parts: [{ text: message.text, type: "text" }],
      role: "user",
    };
    const messages = [incoming];
    await thread.startTyping();
    deps.workspaces.touch(userId);
    let turn: Awaited<ReturnType<typeof startTurn>>;
    try {
      turn = await startTurn(
        {
          browser: workspace.browser,
          budget: deps.budget,
          notices: deps.notices,
          oracleUrl: deps.oracleUrl,
          runs: deps.runs,
          services: deps.services,
          session: workspace.session,
          unlocks: deps.unlocks,
          workspaces: deps.workspaces,
        },
        {
          messages,
          sessionId: workspace.session.id,
          source: "telegram",
          externalThreadId: thread.id,
        }
      );
    } catch (error) {
      // The day's turns are spent. Said in the thread, before any model call.
      if (error instanceof HistoryDuplicateError) {
        return;
      }
      if (
        error instanceof ModelBudgetExhaustedError ||
        error instanceof HistoryConflictError
      ) {
        await thread.post(error.message);
        return;
      }
      throw error;
    }
    deps.publishApp(userId, {
      runId: turn.run.id,
      surface: "telegram",
      type: "run.started",
      v: 1,
    });
    // Recorded for the web app's replay, and streamed here for the person.
    recordTurn(deps, workspace.session.id, turn.run, sseOf(turn));
    try {
      const sent = await thread.post(turn.result.stream);
      await recordTelegramDelivery(
        store.history,
        userId,
        turn.history.assistantMessageId,
        sent.id
      );
    } catch (error) {
      await recordTelegramDelivery(
        store.history,
        userId,
        turn.history.assistantMessageId,
        null
      );
      throw error;
    }
  });

  return {
    codes,
    shutdown: async () => {
      await bot.shutdown();
    },
    deliverWalletAlert: async (alert) => {
      const pairing = await store.telegram.forUser(alert.owner);
      if (
        !pairing ||
        (alert.kind !== "correction" && pairing.since > alert.createdAt)
      ) {
        return { kind: "not_paired" };
      }
      const stableId = MessageId.fromUuid(NoticeId.toUuid(alert.id));
      const previous = await store.history.transaction(
        alert.owner,
        async (tx) => await tx.get(stableId)
      );
      if (previous?.kind === "message" && previous.delivery === "delivered") {
        return {
          kind: "delivered",
          messageId: previous.clientId.replace(/^tg-/u, ""),
        };
      }
      let intent: MessageId;
      try {
        // Outbound alerts can precede the first webhook after a restart. The SDK
        // otherwise sends before its disconnected history store loses the receipt.
        await ensureReady();
        intent = await recordTelegramIntent(
          store,
          alert.owner,
          pairing.threadId,
          alert.text,
          stableId
        );
      } catch {
        return { kind: "definitely_not_sent", retryAfterMs: 2000 };
      }
      const current = await store.telegram.forUser(alert.owner);
      if (
        !current ||
        current.threadId !== pairing.threadId ||
        current.since !== pairing.since
      ) {
        return { kind: "not_paired" };
      }
      let messageId: string;
      try {
        const sent = await bot.thread(current.threadId).post(alert.text);
        messageId = sent.id;
      } catch (error) {
        if (error instanceof AdapterRateLimitError) {
          return {
            kind: "definitely_not_sent",
            retryAfterMs: Math.max(1, error.retryAfter ?? 1) * 1000,
          };
        }
        if (
          error instanceof AuthenticationError ||
          error instanceof PermissionError ||
          error instanceof ResourceNotFoundError ||
          error instanceof ValidationError
        ) {
          return { kind: "definitely_not_sent", retryAfterMs: null };
        }
        await recordTelegramDelivery(
          store.history,
          alert.owner,
          intent,
          null
        ).catch(() => null);
        return { kind: "uncertain" };
      }
      await recordTelegramDelivery(
        store.history,
        alert.owner,
        intent,
        messageId
      ).catch(() => null);
      return { kind: "delivered", messageId };
    },
    deliver: async (report) => {
      await postTo(
        report.userId,
        reportCard(report),
        `${report.title}\n${report.outcome}: ${report.summary === "" ? (report.reason ?? "Nothing to report.") : report.summary}\nSpent: ${report.spentUsdMicros} USD micros. Receipts: ${report.receipts.map((receipt) => receipt.id).join(", ")}`
      );
    },
    link: (code) =>
      deps.botUsername === ""
        ? null
        : `https://t.me/${deps.botUsername}?start=${code}`,
    mode: "live",
    notify: async (userId, text) => {
      const pairing = await store.telegram.forUser(userId);
      if (pairing === null) {
        return false;
      }
      await ensureReady();
      const intent = await recordTelegramIntent(
        store,
        userId,
        pairing.threadId,
        text
      );
      try {
        const sent = await bot.thread(pairing.threadId).post(text);
        await recordTelegramDelivery(store.history, userId, intent, sent.id);
      } catch (error) {
        await recordTelegramDelivery(store.history, userId, intent, null);
        throw error;
      }
      return true;
    },
    postApproval: (userId, request) => {
      detached("telegram approval", async () => {
        await postTo(
          userId,
          approvalCard(request),
          `${request.title}\n${request.purpose}\n${request.amountLabel} · ${request.payeeLabel}\n${request.detail}`
        );
      });
    },
    webhook: async (request) => {
      // Looked up by name: with the adapter map above rejected by the type
      // checker (see the note there), the SDK cannot infer the adapter keys.
      const handler = bot.webhooks["telegram"];
      return handler === undefined
        ? Response.json({ error: "No Telegram webhook." }, { status: 500 })
        : await handler(request);
    },
  };
};
