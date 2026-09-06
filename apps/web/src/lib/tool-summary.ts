/**
 * One line that says what a tool call came to, read from the tool's own words.
 *
 * The server's tools answer the model in prose, and the prose has a fixed
 * shape per outcome: a refusal starts "Refused", an ask starts "This spend is
 * over the automatic limit", a paid fetch ends with the unlocked page's link.
 * These parsers read those shapes and nothing else. A sentence they do not
 * recognise yields no summary and the card shows the story sentence alone.
 * The fixtures in the tests are copied from the server verbatim, so a change
 * of wording there fails a test here rather than silently blanking a card.
 */

import { formatUsd } from "@froggy/domain";
import type { GraphQueryOutput } from "@froggy/protocol";

import type { ToolCall } from "./tool-call";
import { walletStatusOf } from "./wallet-status";

/** `asked` is an ask that ended without an allow: declined, or nobody to ask. */
export type Outcome = "asked" | "info" | "ok" | "refused";

export interface ToolSummary {
  readonly detail: string | null;
  readonly headline: string;
  readonly outcome: Outcome;
  /** A recorded fixture answered, not a live provider. */
  readonly stubbed: boolean;
}

const summary = (
  headline: string,
  outcome: Outcome,
  detail: string | null = null,
  stubbed = false
): ToolSummary => ({ detail, headline, outcome, stubbed });

/** The text after a known opening, trimmed; null when it does not open so. */
const after = (text: string, prefix: string): string | null =>
  text.startsWith(prefix) ? text.slice(prefix.length).trim() : null;

const firstLine = (text: string, max = 140): string => {
  const line = text.split("\n").find((one) => one.trim() !== "") ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** A named group's text; undefined when the match or the group is absent. */
const group = (
  match: RegExpExecArray | null,
  name: string
): string | undefined => match?.groups?.[name];

const REFUSED_BY_POLICY =
  /^Refused by policy \((?<code>[a-z_]+)\): (?<reason>.+)$/su;
const ASK_OPENING =
  "This spend is over the automatic limit and needs the human:";
/** The mandate allowed; the signer, the chain or the run itself did not. */
const SECOND_LAYER_OPENINGS = [
  "Allowed by policy, but not sent:",
  "Allowed by the mandate, but not paid:",
  "Allowed by the mandate, but the top-up did not go through:",
  "Allowed by policy, but the payment did not go through:",
];
/** The model is told to stop; the person does not need telling. */
const STOP_HERE = /\.?\s*Stop here.*$/su;

/** What every spend-shaped answer can say, whichever tool said it. */
const spendOutcome = (text: string): ToolSummary | null => {
  const policyReason = group(REFUSED_BY_POLICY.exec(text), "reason");
  if (policyReason !== undefined) {
    return summary("Refused by the mandate", "refused", policyReason);
  }
  const before = after(text, "Refused before sending:");
  if (before !== null) {
    return summary("Refused before anything was sent", "refused", before);
  }
  const question = after(text, ASK_OPENING);
  if (question !== null) {
    return summary(
      "Over the automatic limit, so it asked you",
      "asked",
      question
    );
  }
  const second =
    SECOND_LAYER_OPENINGS.map((opening) => after(text, opening)).find(
      (rest) => rest !== null
    ) ?? null;
  if (second !== null) {
    const reason = second.replace(STOP_HERE, "");
    // Past the mandate, the only policy left to name is the signer's.
    return summary(
      /privy|policy/iu.test(reason)
        ? "Allowed by the mandate, refused by the signer"
        : "Allowed by the mandate, but not paid",
      "refused",
      reason
    );
  }
  return null;
};

const CHEAPEST = /^Cheapest \S+ borrow: (?<market>.+?) at (?<apr>[\d.]+)% APR/u;
const FRESH = /(?<fresh>\d+)\/(?<total>\d+) indexes fresh/u;

const graphSummary = (text: string): ToolSummary | null => {
  const stubbed = text.includes("[STUB:");
  const freshMatch = FRESH.exec(text);
  const fresh = group(freshMatch, "fresh");
  const total = group(freshMatch, "total");
  const freshness =
    fresh === undefined || total === undefined
      ? null
      : `${fresh} of ${total} indexes fresh`;
  const cheapest = CHEAPEST.exec(text);
  const market = group(cheapest, "market");
  const apr = group(cheapest, "apr");
  if (market !== undefined && apr !== undefined) {
    return summary(`${market} at ${apr}% APR`, "ok", freshness, stubbed);
  }
  if (text.startsWith("No usable markets")) {
    return summary("No usable markets", "info", freshness, stubbed);
  }
  return null;
};

/** The same summary from the fields, for an answer that carries them. */
const graphSummaryOf = (graph: GraphQueryOutput): ToolSummary => {
  const freshness = `${graph.fresh} of ${graph.total} indexes fresh`;
  const [best] = graph.markets;
  return best === undefined
    ? summary("No usable markets", "info", freshness, graph.stubbed)
    : summary(
        `${best.name} on ${best.chain} at ${best.borrowApr.toFixed(2)}% APR`,
        "ok",
        freshness,
        graph.stubbed
      );
};

/**
 * The unlocked page's link is a one-time token for the shared browser. It is
 * never repeated here, or as an anchor anywhere in this UI.
 */
const fetchSummary = (text: string): ToolSummary =>
  spendOutcome(text) ??
  (text.includes("[Paid. The unlocked page")
    ? summary("Paid. The unlocked page went to the shared browser", "ok")
    : summary("Answered without asking to be paid", "info"));

const SENT =
  /^Sent (?<amount>[\d.]+) USDC to \S+ on Base Sepolia\. Transaction \S+\.$/u;

const sendSummary = (text: string): ToolSummary | null => {
  const sent = group(SENT.exec(text), "amount");
  if (sent !== undefined) {
    return summary(`Sent ${sent} USDC on Base Sepolia`, "ok");
  }
  if (text.startsWith("Allowed by the mandate;")) {
    return summary("Allowed by the mandate", "ok", text);
  }
  return spendOutcome(text);
};

const TOPPED =
  /^Topped up: (?<amount>[\d.]+) USDC to the treasury on Base Sepolia.*?\. (?<pocket>The pocket now holds .+)$/su;

const topupSummary = (text: string): ToolSummary | null => {
  const toppedMatch = TOPPED.exec(text);
  const topped = group(toppedMatch, "amount");
  const pocket = group(toppedMatch, "pocket");
  if (topped !== undefined) {
    return summary(`Topped up ${topped} USDC`, "ok", pocket ?? null);
  }
  if (text.startsWith("Top-ups are not configured")) {
    return summary("Top-ups are not configured here", "info", text);
  }
  return spendOutcome(text);
};

const statusSummary = (text: string): ToolSummary | null => {
  const status = walletStatusOf(text);
  if (status === null) {
    return null;
  }
  const { frozen, pocketUsdMicros, windowSpentUsdMicros } = status;
  const pocket =
    pocketUsdMicros === undefined || pocketUsdMicros === null
      ? []
      : [`Pocket ${formatUsd(pocketUsdMicros)}`];
  const detail = [...pocket, ...(frozen ? ["frozen"] : [])].join(" · ");
  return summary(
    `${formatUsd(windowSpentUsdMicros)} spent in this window`,
    "info",
    detail === "" ? null : detail
  );
};

const navigateSummary = (text: string): ToolSummary | null => {
  const refused = after(text, "Refused:");
  return refused === null
    ? null
    : summary("Refused before anything was sent", "refused", refused);
};

const clickSummary = (text: string): ToolSummary =>
  summary(
    firstLine(text),
    text.includes("not in the current snapshot") ? "refused" : "info"
  );

/** Null when the call has no output yet, or said something no parser reads. */
export const summarize = (call: ToolCall): ToolSummary | null => {
  const text = call.output;
  if (text === null) {
    return null;
  }
  switch (call.name) {
    case "graph_query": {
      // The prose parser stays for messages from before the fields existed.
      return call.graph === null
        ? graphSummary(text)
        : graphSummaryOf(call.graph);
    }
    case "x402_fetch": {
      return fetchSummary(text);
    }
    case "x402_probe": {
      return summary(firstLine(text), "info");
    }
    case "wallet_send": {
      return sendSummary(text);
    }
    case "wallet_topup": {
      return topupSummary(text);
    }
    case "wallet_status": {
      return statusSummary(text);
    }
    case "browser_navigate": {
      return navigateSummary(text);
    }
    case "browser_click": {
      return clickSummary(text);
    }
    default: {
      return null;
    }
  }
};
