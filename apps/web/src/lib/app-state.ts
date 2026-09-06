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
import type { Mandate, PolicyDecision, Receipt } from "@froggy/domain";
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
 * belongs in it: a freeze, an unfreeze, a top-up. Filed in the stream at the
 * moment it happened, as a marker between turns.
 */
export interface TimelineEvent {
  readonly at: number;
  readonly id: string;
  readonly kind: "frozen" | "topup" | "unfrozen";
  readonly text: string;
}

export interface AppState {
  readonly approvals: readonly ApprovalRequest[];
  readonly connected: boolean;
  /** Oldest first. */
  readonly events: readonly TimelineEvent[];
  readonly lastDecision: PolicyDecision | null;
  readonly mandate: Mandate | null;
  readonly modes: ServiceModes | null;
  readonly notices: readonly Notice[];
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
  approvals: [],
  connected: false,
  events: [],
  lastDecision: null,
  mandate: null,
  modes: null,
  notices: [],
  receipts: [],
  sessionId: null,
  wallet: null,
};

/** How many notices are kept on screen. Older ones are the log's problem. */
const MAX_NOTICES = 3;
/** How many timeline events are kept. A day of freezes is not this many. */
const MAX_EVENTS = 100;

/**
 * What changed, as an event, when a state message differs from what we had.
 *
 * Only differences: the first mandate and the first wallet summary are the
 * starting point, not a change, and a reconnect resending the same state
 * must not file a second marker.
 */
const eventsFrom = (
  state: AppState,
  message: AppServerMessage,
  at: number
): readonly TimelineEvent[] => {
  if (message.type === "mandate.state") {
    const before = state.mandate?.frozen ?? null;
    const after = message.mandate.frozen;
    if (before === null || before === after) {
      return [];
    }
    return after
      ? [
          {
            at,
            id: `frozen:${at}`,
            kind: "frozen",
            text: "The wallet was frozen. The pocket is zero and nothing is spent until it is unfrozen.",
          },
        ]
      : [
          {
            at,
            id: `unfrozen:${at}`,
            kind: "unfrozen",
            text: "The wallet was unfrozen.",
          },
        ];
  }
  if (message.type === "wallet.state") {
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
        text: `The pocket was topped up by ${formatUsd(after - before)}, to ${formatUsd(after)}.`,
      },
    ];
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
    case "session.welcome": {
      return { ...state, modes: message.modes, sessionId: message.sessionId };
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
      return { ...state, approvals: [...state.approvals, message.request] };
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
      if (message.surface === "web") {
        return state;
      }
      const notice: Notice = {
        at,
        id: `run:${message.runId}`,
        text: `A turn started from ${message.surface === "telegram" ? "Telegram" : "the daily digest"}. Reload to follow it here.`,
        tone: "info",
      };
      return {
        ...state,
        notices: [notice, ...state.notices].slice(0, MAX_NOTICES),
      };
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

/** The rolling cap the meter is drawn against: the widest window rule. */
export const bindingWindowCap = (
  mandate: Mandate | null
): { readonly maxUsdMicros: number; readonly windowMs: number } | null => {
  if (mandate === null) {
    return null;
  }
  let widest: { maxUsdMicros: number; windowMs: number } | null = null;
  for (const rule of mandate.rules) {
    if (
      rule._tag === "window_cap" &&
      (widest === null || rule.windowMs > widest.windowMs)
    ) {
      widest = { maxUsdMicros: rule.maxUsdMicros, windowMs: rule.windowMs };
    }
  }
  return widest;
};
