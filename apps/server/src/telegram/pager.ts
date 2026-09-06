/**
 * Telegram, as a pager and a second mouth.
 *
 * One bot, one DM per person. It carries the daily digest, puts approval
 * questions in front of the person with the same four answers as the web
 * ticket, freezes on request, and — because the loop is the same loop —
 * lets the person talk to the agent from their phone. A turn started here
 * runs on the same session, under the same mandate, in the same run
 * registry, so the web app can see it and the freeze button stops it.
 *
 * Nothing here is reachable without a pairing: a Telegram account becomes
 * somebody's only through a code they minted while signed in, and every
 * message and button is looked up against that pairing before it does
 * anything. The stub answers 404 and says so, so a deployment without a bot
 * token never looks like one with a bot that is silently ignoring people.
 */

import { createMemoryState } from "@chat-adapter/state-memory";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import type { TelegramAdapterConfig } from "@chat-adapter/telegram";
import type { UserId } from "@froggy/domain";
import type { AppServerMessage, ApprovalRequest } from "@froggy/protocol";
import type { UIMessage } from "ai";
import { Chat } from "chat";
import type { Thread } from "chat";

import { ModelBudgetExhaustedError } from "../budget";
import type { ModelBudget } from "../budget";
import { detached } from "../detached";
import type { FreezeControl } from "../freeze";
import type { InteractionRegistry } from "../interactions";
import type { DigestReport, DigestSink } from "../jobs";
import type { ChatRunRegistry } from "../runs";
import type { Services } from "../services";
import { recordTurn, sseOf, startTurn } from "../turn";
import type { Workspaces } from "../workspaces";
import {
  APPROVAL_ACTION,
  approvalCard,
  digestCard,
  FREEZE_ACTION,
  pairedCard,
  parseApprovalValue,
} from "./cards";
import { PairingCodes } from "./pairing";

/** How much of a Telegram conversation the model sees. Phones are terse. */
const HISTORY = 20;

export interface TelegramPager extends DigestSink {
  readonly codes: PairingCodes;
  /** The deep link a person opens to pair, given a fresh code. */
  readonly link: (code: string) => string | null;
  readonly mode: "live" | "stub";
  /** An approval question, to the person's paired chat if they have one. */
  readonly postApproval: (userId: UserId, request: ApprovalRequest) => void;
  readonly webhook: (request: Request) => Promise<Response>;
}

export const stubTelegramPager = (): TelegramPager => ({
  codes: new PairingCodes(),
  deliver: async (report: DigestReport) => {
    await Promise.resolve();
    console.info(
      `[digest] ${report.userId} ${report.outcome}: ${report.summary || "(no summary)"} — spent $${(report.spentUsdMicros / 1_000_000).toFixed(4)} over ${report.receipts.length} receipt(s)`
    );
  },
  link: () => null,
  mode: "stub",
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
  readonly freeze: FreezeControl;
  readonly interactions: InteractionRegistry;
  readonly oracleUrl: string;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
  readonly runs: ChatRunRegistry;
  readonly services: Services;
  readonly webhookSecret: string;
  readonly workspaces: Workspaces;
}

const NOT_PAIRED =
  "This chat is not paired with a Froggy account yet. Open Froggy, go to Details → Wallet → Telegram, and send the code here as /start CODE.";

export const liveTelegramPager = (deps: LivePagerDeps): TelegramPager => {
  const { store } = deps.services;
  const codes = new PairingCodes();
  const histories = new Map<UserId, UIMessage[]>();

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

  const whose = async (telegramUserId: string): Promise<UserId | null> =>
    await store.telegram.lookup(telegramUserId);

  const postTo = (userId: UserId, message: Parameters<Thread["post"]>[0]) => {
    detached("telegram post", async () => {
      const pairing = await store.telegram.forUser(userId);
      if (pairing === null) {
        return;
      }
      await bot.thread(pairing.threadId).post(message);
    });
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

  bot.onSlashCommand("/freeze", async (event) => {
    const userId = await whose(event.user.userId);
    const thread = await bot.openDM(event.user.userId);
    if (userId === null) {
      await thread.post(NOT_PAIRED);
      return;
    }
    deps.freeze.freeze(userId, "frozen from Telegram", null);
    await thread.post(
      "Frozen. The run is stopped, the browser is held, and nothing can be paid until you unfreeze from the workspace."
    );
  });

  bot.onAction(FREEZE_ACTION, async (event) => {
    const userId = await whose(event.user.userId);
    if (userId === null) {
      await event.thread?.post(NOT_PAIRED);
      return;
    }
    deps.freeze.freeze(userId, "frozen from Telegram", null);
    await event.thread?.post("Frozen.");
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
      deps.freeze.freeze(userId, "stopped from Telegram", null);
    }
    await event.thread?.post(
      taken ? "Noted." : "That question has already been answered."
    );
  });

  bot.onDirectMessage(async (thread, message) => {
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
    if (workspace.session.currentMandate.frozen) {
      await thread.post(
        "The wallet is frozen; unfreeze it from the workspace before asking for anything."
      );
      return;
    }
    const history = histories.get(userId) ?? [];
    const incoming: UIMessage = {
      id: `tg-${message.id}`,
      parts: [{ text: message.text, type: "text" }],
      role: "user",
    };
    const messages: UIMessage[] = [...history, incoming].slice(-HISTORY);
    await thread.startTyping();
    deps.workspaces.touch(userId);
    let turn: Awaited<ReturnType<typeof startTurn>>;
    try {
      turn = await startTurn(
        {
          browser: workspace.browser,
          budget: deps.budget,
          oracleUrl: deps.oracleUrl,
          runs: deps.runs,
          services: deps.services,
          session: workspace.session,
          workspaces: deps.workspaces,
        },
        { messages, sessionId: workspace.session.id }
      );
    } catch (error) {
      // The day's turns are spent. Said in the thread, before any model call.
      if (error instanceof ModelBudgetExhaustedError) {
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
    await thread.post(turn.result.stream);
    const reply: UIMessage = {
      id: `tg-${message.id}-reply`,
      parts: [{ text: await turn.result.text, type: "text" }],
      role: "assistant",
    };
    histories.set(userId, [...messages, reply]);
  });

  return {
    codes,
    deliver: async (report) => {
      await Promise.resolve();
      postTo(report.userId, digestCard(report));
    },
    link: (code) =>
      deps.botUsername === ""
        ? null
        : `https://t.me/${deps.botUsername}?start=${code}`,
    mode: "live",
    postApproval: (userId, request) => {
      postTo(userId, approvalCard(request));
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
