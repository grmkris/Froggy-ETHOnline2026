/**
 * The words the Watchlist says about a saved item: one sentence per row, one
 * state per chip, one sentence per onchain event. Pure functions over the
 * payloads that already arrive, so the list and the detail cannot disagree.
 */

import {
  chainName,
  listChainNames,
  monitorCoverage,
  shortEvmAddress,
  visiblePresence,
} from "@froggy/domain";
import type {
  AddressPresence,
  Monitor,
  WalletActivity,
  WalletMonitor,
  WalletMonitorStatus,
  WatchlistItem,
} from "@froggy/domain";

export type WatchState =
  | "watching"
  | "needs_you"
  | "paused"
  | "ended"
  | "saved"
  | "archived";

export const stateWords: Record<WatchState, string> = {
  watching: "Watching",
  needs_you: "Needs you",
  paused: "Paused",
  ended: "Ended",
  saved: "Saved",
  archived: "Archived",
};

/** A live onchain watch: starting, streaming, waiting for a price, or catching up. */
export const activeState = (state: WalletMonitorStatus["state"]): boolean =>
  ["starting", "watching", "waiting_price", "delayed"].includes(state);

const STABLE = new Set(["USDC", "USDG", "USDT", "DAI"]);
const number = (value: number, options: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat("en-US", options).format(value);

/** Raw units to a figure a person reads; the full figure belongs in a title attribute. */
export const amountWords = (
  units: string,
  decimals: number | null,
  symbol: string | null
): string => {
  if (decimals === null) {
    return `${units} raw units`;
  }
  const whole = units.padStart(decimals + 1, "0");
  const value = Number(
    `${whole.slice(0, whole.length - decimals)}.${whole.slice(whole.length - decimals)}`
  );
  if (!Number.isFinite(value)) {
    return `${units} raw units`;
  }
  let figure: string;
  if (symbol !== null && STABLE.has(symbol.toUpperCase())) {
    figure = number(value, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  } else if (value === 0) {
    figure = "0";
  } else if (value >= 1) {
    figure = number(value, { maximumFractionDigits: 2 });
  } else {
    figure = number(value, { maximumSignificantDigits: 3 });
  }
  return symbol === null ? figure : `${figure} ${symbol}`;
};

/** "2 min ago", "3 h ago", "yesterday", "13 Sep". */
export const timeWords = (at: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  if (hours < 48) {
    return "yesterday";
  }
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
};

/** "18:41" or "6:41 PM", whichever the person's locale says. */
const clockWords = (at: number): string =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const assetWords = (value: string | null): string => {
  if (value === null) {
    return "";
  }
  return value === "native" ? " of ETH" : ` of ${shortEvmAddress(value)}`;
};

/** "transfers and swaps", "sends", "a price below 0.01 USDC". */
export const ruleWords = (monitor: WalletMonitor): string => {
  const rules = monitor.rules ?? [];
  const parts =
    rules.length > 0
      ? rules.map(({ condition }) => {
          if (condition._tag === "price") {
            return `a price ${condition.comparison} ${condition.threshold} ${condition.quoteCurrency}`;
          }
          if (condition._tag === "transfer") {
            return `${{ both: "transfers", sent: "sends", received: "receives" }[condition.direction]}${assetWords(condition.token)}`;
          }
          return `${{ both: "swaps", bought: "buys", sold: "sells" }[condition.side]}${assetWords(condition.token)}`;
        })
      : [
          ...(monitor.transfers ? ["transfers"] : []),
          ...(monitor.swaps ? ["swaps"] : []),
        ];
  if (parts.length === 0) {
    return "activity";
  }
  if (parts.length === 1) {
    return parts[0] ?? "activity";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
};

const watchChains = (
  monitor: WalletMonitor,
  presence: readonly AddressPresence[]
): string => {
  const covered = monitorCoverage(monitor).map((entry) => entry.network);
  if (covered.length > 0) {
    return listChainNames(covered);
  }
  const seen = visiblePresence(presence)
    .filter((row) => row.status === "observed")
    .map((row) => row.network);
  return seen.length > 0 ? listChainNames(seen) : "";
};

const onChains = (chains: string): string =>
  chains === "" ? "" : ` on ${chains}`;

const cadenceWords: Record<Monitor["cadence"], string> = {
  hourly: "every hour",
  daily: "every day",
  weekly: "every week",
};

export interface WatchStanding {
  readonly state: WatchState;
  /** One sentence in the person's words; null when the row already says it another way. */
  readonly words: string | null;
}

/** Where a saved item stands, from the list payload alone. */
export const watchStanding = (
  item: WatchlistItem,
  {
    presence = [],
    monitor = null,
    now,
    attention = null,
  }: {
    readonly presence?: readonly AddressPresence[];
    readonly monitor?: Monitor | null | undefined;
    readonly now: number;
    readonly attention?: string | null;
  }
): WatchStanding => {
  if (item.archived) {
    return { state: "archived", words: null };
  }
  if (attention !== null) {
    return { state: "needs_you", words: `Needs you · ${attention}` };
  }
  const watch = item.walletMonitor;
  if (watch) {
    const chains = onChains(watchChains(watch, presence));
    const rules = ruleWords(watch);
    if (!watch.enabled) {
      return {
        state: "paused",
        words: `Paused · ${rules}${chains} · ends ${clockWords(watch.expiresAt)} either way`,
      };
    }
    if (watch.expiresAt <= now) {
      return {
        state: "ended",
        words: `Watch ended ${timeWords(watch.expiresAt, now)} · extend to keep watching`,
      };
    }
    const price = (watch.rules ?? []).some(
      (rule) => rule.condition._tag === "price"
    );
    return {
      state: "watching",
      words: `Watching${price ? " for" : ""} ${rules}${chains} · until ${clockWords(watch.expiresAt)} · Telegram ${watch.telegram ? "on" : "off"}`,
    };
  }
  if (monitor) {
    if (monitor.status === "checking") {
      return { state: "watching", words: "Checking now" };
    }
    if (monitor.status === "scheduled") {
      return {
        state: "watching",
        words: `Checking ${cadenceWords[monitor.cadence]} · next ${clockWords(monitor.nextAt)}`,
      };
    }
    if (monitor.status === "paused") {
      return { state: "paused", words: "Checks paused" };
    }
    return {
      state: "needs_you",
      words: `Needs you · ${
        {
          needs_help: "a check needs your help",
          budget_exhausted: "the monitoring budget is used up",
          failed: "the last check failed",
        }[monitor.status]
      }`,
    };
  }
  return { state: "saved", words: null };
};

/** "0.022 ETH · 15.30 USDC on Base"; "A contract on Base"; null before discovery. */
export const balanceWords = (
  rows: readonly AddressPresence[]
): string | null => {
  const seen = visiblePresence(rows).filter((row) => row.status === "observed");
  if (seen.length === 0) {
    return null;
  }
  return seen
    .map((row) => {
      if (row.kind === "contract") {
        const name = row.token?.symbol ?? row.token?.name ?? null;
        return `${name === null ? "A contract" : `Token ${name}`} on ${chainName(row.network)}`;
      }
      const parts = [
        ...(row.nativeBalance === null
          ? []
          : [amountWords(row.nativeBalance, 18, "ETH")]),
        ...(row.usdc === null
          ? []
          : [amountWords(row.usdc.units, row.usdc.decimals, "USDC")]),
      ];
      return `${parts.length === 0 ? "Wallet" : parts.join(" · ")} on ${chainName(row.network)}`;
    })
    .join(" · ");
};

const venueWords: Record<WalletActivity["venues"][number], string> = {
  uniswap_v2: "Uniswap v2",
  uniswap_v3: "Uniswap v3",
  uniswap_v4: "Uniswap v4",
  aerodrome: "Aerodrome",
  pons: "Pons",
};

type Flow = WalletActivity["flows"][number];
/** What to call a flow's asset; the panel passes the domain's lookalike-aware label. */
export type AssetLabel = (flow: Flow) => string;
const defaultLabel: AssetLabel = (flow) => flow.symbol ?? flow.asset;
const flowWords = (flow: Flow, label: AssetLabel): string =>
  amountWords(flow.amount, flow.decimals, label(flow));

/** "Received 15.30 USDC from 0x8Cc2…08C2"; "Swapped 0.5 ETH for 1,204 USDC on Uniswap v3". */
export const eventSentence = (
  activity: WalletActivity,
  label: AssetLabel = defaultLabel
): string => {
  if (activity.price) {
    const { price } = activity;
    return `Price ${price.initiallyMatched ? "already" : "moved"} ${price.comparison} ${price.threshold} ${price.quoteCurrency} · observed ${price.observation.price} ${price.quoteCurrency}`;
  }
  const sent = activity.flows.find((flow) => flow.swapSide === "sent");
  const received = activity.flows.find((flow) => flow.swapSide === "received");
  if (sent && received) {
    const [venue] = activity.venues;
    return `Swapped ${flowWords(sent, label)} for ${flowWords(received, label)}${venue === undefined ? "" : ` on ${venueWords[venue]}`}`;
  }
  const [first] = activity.flows;
  if (first === undefined) {
    return "Wallet activity";
  }
  const rest = activity.flows.length - 1;
  const more = rest > 0 ? ` and ${rest} more` : "";
  return `${first.direction === "sent" ? "Sent" : "Received"} ${flowWords(first, label)} ${first.direction === "sent" ? "to" : "from"} ${shortEvmAddress(first.counterparty)}${more}`;
};

/** One flow as a line under a many-flow event. */
export const flowSentence = (flow: Flow, label: AssetLabel): string =>
  `${flow.direction === "sent" ? "Sent" : "Received"} ${flowWords(flow, label)} ${flow.direction === "sent" ? "to" : "from"} ${shortEvmAddress(flow.counterparty)}`;

const finalityWords: Record<WalletActivity["finality"], string> = {
  provisional: "awaiting confirmation",
  finalized: "confirmed",
  reverted: "reverted",
  unverified: "unverified",
};
const deliveryWords: Record<WalletActivity["delivery"], string> = {
  waiting: "Telegram queued",
  delivered: "Telegram delivered",
  not_paired: "Telegram off",
  cancelled: "Telegram cancelled",
  uncertain: "Telegram uncertain",
  failed: "Telegram failed",
  summarized: "in Telegram summary",
};

/** The small print under an event: "confirmed · Base · Telegram delivered". */
export const eventMeta = (activity: WalletActivity): readonly string[] => [
  finalityWords[activity.finality],
  chainName(activity.network),
  deliveryWords[activity.delivery],
];

/** The one status line under the headline: "2 watching on Base · 3 saved · alerts to Telegram". */
export const pageSentence = (
  items: readonly WatchlistItem[],
  now: number
): string => {
  const live = items.filter((item) => !item.archived);
  const watching = live.filter(
    (item) =>
      item.walletMonitor?.enabled === true && item.walletMonitor.expiresAt > now
  );
  const saved = live.length - watching.length;
  if (watching.length === 0) {
    return live.length === 0
      ? "Nothing saved yet"
      : `${saved} saved · nothing watching yet`;
  }
  const chains = [
    ...new Set(
      watching.flatMap((item) =>
        item.walletMonitor
          ? monitorCoverage(item.walletMonitor).map((entry) => entry.network)
          : []
      )
    ),
  ];
  const telegram = watching.some(
    (item) => item.walletMonitor?.telegram === true
  );
  return `${watching.length} watching${onChains(listChainNames(chains))} · ${saved} saved${telegram ? " · alerts to Telegram" : ""}`;
};

export interface WindowLeft {
  readonly percent: number;
  readonly words: string;
}

/** How much of the watch window is left, for the time bar. */
export const windowLeft = (monitor: WalletMonitor, now: number): WindowLeft => {
  const total = Math.max(1, monitor.expiresAt - monitor.startedAt);
  const left = Math.max(0, monitor.expiresAt - now);
  const hours = Math.round(left / 3_600_000);
  const minutes = Math.round(left / 60_000);
  let words = `Ends ${clockWords(monitor.expiresAt)} · ${hours} h left`;
  if (left === 0) {
    words = `Ended ${timeWords(monitor.expiresAt, now)}`;
  } else if (hours === 0) {
    words = `Ends ${clockWords(monitor.expiresAt)} · ${Math.max(1, minutes)} min left`;
  }
  return { percent: Math.round((left / total) * 100), words };
};
