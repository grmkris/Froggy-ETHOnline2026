/**
 * The app socket's state, as a pure reducer.
 *
 * Every message the server sends on `/ws/app` lands here as an event, and the
 * function below is the only thing that turns it into state. Pure so it can
 * be tested without a socket, and because the rules are the kind that rot
 * silently inside a `useEffect`: a receipt must never be duplicated by a
 * reconnect, an approval card must vanish on every tab the moment anyone
 * answers it, and a protocol error must be said rather than swallowed.
 */

import { formatUsd } from "@froggy/domain";
import type {
  ApprovalResolution,
  Mandate,
  PolicyDecision,
  Receipt,
} from "@froggy/domain";
import type {
  AppServerMessage,
  ApprovalRequest,
  ServiceModes,
  WalletSummary,
} from "@froggy/protocol";

export interface Notice {
  readonly at: number;
  readonly id: string;
  readonly text: string;
  readonly tone: "error" | "info";
}

/**
 * Something that happened to the wallet while the conversation went on, and
 * belongs in it: a question, an answer, a conversion, a message the agent
 * sent unasked. Filed in the stream at the moment it happened, as a marker
 * between turns.
 */
export interface TimelineEvent {
  readonly at: number;
  readonly id: string;
  readonly kind: "answered" | "asked" | "elsewhere" | "notice" | "topup";
  readonly text: string;
}

/** Where a turn that this tab did not start came from, in words. */
const SURFACE_WORDS: ReadonlyMap<
  Extract<AppServerMessage, { readonly type: "run.started" }>["surface"],
  string
> = new Map([
  ["digest", "the daily digest"],
  ["schedule", "a schedule"],
  ["telegram", "Telegram"],
  ["web", "the web"],
]);

type NoticeMessage = Extract<AppServerMessage, { readonly type: "notice" }>;

const NOTICE_LEAD: ReadonlyMap<NoticeMessage["notice"]["source"], string> =
  new Map([
    ["notify", "Froggy"],
    ["reminder", "Reminder"],
    ["scheduled_run", "Scheduled run"],
  ]);

/** How a notice reads in the margin: what it was, and whether the phone saw it too. */
const noticeText = (notice: NoticeMessage["notice"]): string =>
  `${NOTICE_LEAD.get(notice.source) ?? "Froggy"}: ${notice.text}${notice.telegram ? " (also sent to Telegram)" : ""}`;

/** How the person's answer reads in the margin. */
const ANSWER_WORDS: Record<ApprovalResolution, string> = {
  aborted: "the question was withdrawn",
  allow_once: "allowed once",
  allow_session: "allowed for this session",
  deny: "not this time",
  deny_stop: "stop the agent",
  timeout: "nobody answered in time",
  unavailable: "there was no one to ask",
};

export interface AppState {
  readonly historySequence: number;
  readonly approvals: readonly ApprovalRequest[];
  readonly connected: boolean;
  /** Oldest first. */
  readonly events: readonly TimelineEvent[];
  /** Where the audit notes go, when a topic is pinned. */
  /** The agent's key quorum, from the welcome; null when the server has no agent key. */
  readonly agentSignerId: string | null;
  readonly hcsTopicId: string | null;
  readonly lastDecision: PolicyDecision | null;
  /** Where an MCP client connects by URL; null until this deployment answers there. */
  readonly mcpUrl: string | null;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly notices: readonly Notice[];
  /** The Privy policy the agent's signer is held to. */
  readonly policyId: string | null;
  /** Newest first. Append-only in spirit: a receipt is a record of the past. */
  readonly receipts: readonly Receipt[];
  readonly sessionId: string | null;
  readonly wallet: WalletSummary | null;
}

export type AppEvent =
  | { readonly type: "dismiss"; readonly id: string }
  | {
      readonly type: "receipts";
      readonly receipts: readonly Receipt[];
    }
  | {
      readonly type: "server";
      readonly at: number;
      readonly message: AppServerMessage;
    }
  | { readonly type: "socket"; readonly connected: boolean };

export const initialAppState: AppState = {
  historySequence: 0,
  approvals: [],
  connected: false,
  events: [],
  agentSignerId: null,
  hcsTopicId: null,
  lastDecision: null,
  mcpUrl: null,
  mandate: null,
  modes: null,
  notices: [],
  policyId: null,
  receipts: [],
  sessionId: null,
  wallet: null,
};

/** How many notices are kept on screen. Older ones are the log's problem. */
const MAX_NOTICES = 3;
/** How many timeline events are kept. A day of questions is not this many. */
const MAX_EVENTS = 100;

const approvalEvents = (
  state: AppState,
  message: Extract<AppServerMessage, { readonly type: "approval.request" }>,
  at: number
): readonly TimelineEvent[] =>
  state.approvals.some((open) => open.id === message.request.id)
    ? []
    : [
        {
          at,
          id: `asked:${message.request.id}`,
          kind: "asked",
          text: "Froggy paused, waiting for your answer.",
        },
      ];

const receiptEvents = (
  state: AppState,
  message: Extract<AppServerMessage, { readonly type: "receipt.appended" }>
): readonly TimelineEvent[] => {
  const { approval, at, id } = message.receipt;
  return approval === undefined ||
    state.receipts.some((known) => known.id === id)
    ? []
    : [
        {
          at,
          id: `answered:${approval.id}`,
          kind: "answered",
          text: `You answered: ${ANSWER_WORDS[approval.resolution]}.`,
        },
      ];
};

const runEvents = (
  message: Extract<AppServerMessage, { readonly type: "run.started" }>,
  at: number
): readonly TimelineEvent[] =>
  message.surface === "web"
    ? []
    : [
        {
          at,
          id: `run:${message.runId}`,
          kind: "elsewhere",
          text: `A turn started from ${SURFACE_WORDS.get(message.surface) ?? "elsewhere"}. Reload to follow it here.`,
        },
      ];

const noticeEvents = (
  state: AppState,
  message: NoticeMessage
): readonly TimelineEvent[] =>
  state.events.some((event) => event.id === `notice:${message.notice.id}`)
    ? []
    : [
        {
          at: message.notice.at,
          id: `notice:${message.notice.id}`,
          kind: "notice",
          text: noticeText(message.notice),
        },
      ];

const walletEvents = (
  state: AppState,
  message: Extract<AppServerMessage, { readonly type: "wallet.state" }>,
  at: number
): readonly TimelineEvent[] => {
  const before = state.wallet?.pocketUsdMicros ?? null;
  const after = message.wallet.pocketUsdMicros ?? null;
  if (before === null || after === null || after <= before) {
    return [];
  }
  return [
    {
      at,
      id: `topup:${at}`,
      kind: "topup",
      text: `Froggy moved ${formatUsd(after - before)} to Hedera for payments; ${formatUsd(after)} is ready there.`,
    },
  ];
};

/**
 * What changed, as an event, when a message differs from what we had.
 *
 * Only differences: the first mandate and the first wallet summary are the
 * starting point, not a change; a reconnect resending the same state, card
 * or receipt must not file a second marker.
 */
const eventsFrom = (
  state: AppState,
  message: AppServerMessage,
  at: number
): readonly TimelineEvent[] => {
  if (message.type === "approval.request") {
    return approvalEvents(state, message, at);
  }
  if (message.type === "receipt.appended") {
    return receiptEvents(state, message);
  }
  if (message.type === "run.started") {
    return runEvents(message, at);
  }
  if (message.type === "wallet.state") {
    return walletEvents(state, message, at);
  }
  if (message.type === "notice") {
    return noticeEvents(state, message);
  }
  return [];
};

const withEvents = (
  state: AppState,
  message: AppServerMessage,
  at: number
): readonly TimelineEvent[] =>
  [...state.events, ...eventsFrom(state, message, at)].slice(-MAX_EVENTS);

/** Merge without duplicates, newest first. Reconnects and backfills both land here. */
const mergeReceipts = (
  current: readonly Receipt[],
  incoming: readonly Receipt[]
): readonly Receipt[] => {
  const byId = new Map<string, Receipt>();
  for (const receipt of [...current, ...incoming]) {
    byId.set(receipt.id, receipt);
  }
  return [...byId.values()].toSorted((a, b) => b.at - a.at);
};

const onServer = (
  state: AppState,
  message: AppServerMessage,
  at: number
): AppState => {
  switch (message.type) {
    case "history.changed": {
      return {
        ...state,
        historySequence: Math.max(state.historySequence, message.sequence),
      };
    }
    case "session.welcome": {
      return {
        ...state,
        agentSignerId: message.agentSignerId,
        hcsTopicId: message.hcsTopicId,
        mcpUrl: message.mcpUrl,
        modes: message.modes,
        policyId: message.policyId,
        sessionId: message.sessionId,
      };
    }
    case "mandate.state": {
      return {
        ...state,
        events: withEvents(state, message, at),
        mandate: message.mandate,
      };
    }
    case "wallet.state": {
      return {
        ...state,
        events: withEvents(state, message, at),
        wallet: message.wallet,
      };
    }
    case "receipt.appended": {
      return {
        ...state,
        events: withEvents(state, message, at),
        receipts: mergeReceipts(state.receipts, [message.receipt]),
      };
    }
    case "policy.decision": {
      return { ...state, lastDecision: message.decision };
    }
    case "approval.request": {
      if (state.approvals.some((open) => open.id === message.request.id)) {
        return state;
      }
      return {
        ...state,
        approvals: [...state.approvals, message.request],
        events: withEvents(state, message, at),
      };
    }
    case "approval.resolved": {
      return {
        ...state,
        approvals: state.approvals.filter(
          (open) => open.id !== message.requestId
        ),
      };
    }
    case "protocol.error": {
      const notice: Notice = {
        at,
        id: `${message.code}:${at}`,
        text: message.message,
        tone: "error",
      };
      return {
        ...state,
        notices: [notice, ...state.notices].slice(0, MAX_NOTICES),
      };
    }
    case "run.started": {
      // A marker in the conversation, where the turn will appear, rather
      // than a notice above the composer.
      return { ...state, events: withEvents(state, message, at) };
    }
    case "notice": {
      return { ...state, events: withEvents(state, message, at) };
    }
    case "pong": {
      return state;
    }
    default: {
      return state;
    }
  }
};

export const reduceApp = (state: AppState, event: AppEvent): AppState => {
  switch (event.type) {
    case "socket": {
      return { ...state, connected: event.connected };
    }
    case "server": {
      return onServer(state, event.message, event.at);
    }
    case "receipts": {
      return {
        ...state,
        receipts: mergeReceipts(state.receipts, event.receipts),
      };
    }
    case "dismiss": {
      return {
        ...state,
        notices: state.notices.filter((notice) => notice.id !== event.id),
      };
    }
    default: {
      return state;
    }
  }
};
