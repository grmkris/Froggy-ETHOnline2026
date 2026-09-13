import { formatUsd, Purchase } from "@froggy/domain";
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
import type { TaskStatus } from "@froggy/domain";
import {
  AddressLookupResult,
  ServiceCatalog,
  ServiceTicket,
} from "@froggy/protocol";
import type { AddressLookupNetwork, GraphQueryOutput } from "@froggy/protocol";
import { Schema } from "effect";

import { creditChargeWords, formatCredits } from "./credit-view";
import { networkWords } from "./mandate-words";
import { statusWords } from "./services-view";
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

const PurchaseOutput = Schema.Struct({
  v: Schema.Literals([1]),
  id: Purchase.fields.id,
  status: Purchase.fields.status,
  payment: Schema.Struct({ state: Purchase.fields.payment.fields.state }),
  delivery: Schema.Struct({ state: Purchase.fields.delivery.fields.state }),
  error: Purchase.fields.error,
  stubbed: Purchase.fields.stubbed,
});
const decodePurchaseOutput = Schema.decodeUnknownResult(
  Schema.fromJsonString(PurchaseOutput)
);

export const urlPurchaseOf = (
  text: string
): typeof PurchaseOutput.Type | null => {
  const decoded = decodePurchaseOutput(text);
  return decoded._tag === "Success" ? decoded.success : null;
};

const purchaseSummary = (purchase: typeof PurchaseOutput.Type): ToolSummary => {
  const { payment, delivery, status, error, stubbed } = purchase;
  if (payment.state === "uncertain" || status === "uncertain") {
    return summary(
      "Payment uncertain",
      "info",
      "Check the saved purchase in Services before buying again.",
      stubbed
    );
  }
  if (payment.state === "settled") {
    const paid = stubbed ? "Simulated payment" : "Paid";
    const result =
      delivery.state === "delivered"
        ? "result delivered"
        : "delivery incomplete";
    return summary(
      `${paid} · ${result}`,
      "ok",
      "The saved response is in Services.",
      stubbed
    );
  }
  if (
    status === "declined" ||
    status === "cancelled" ||
    status === "expired" ||
    status === "failed"
  ) {
    return summary(`Purchase ${status}`, "refused", error, stubbed);
  }
  if (delivery.state === "delivered" && payment.state === "none") {
    return summary(
      "Delivered without payment",
      "info",
      "The saved response is in Services.",
      stubbed
    );
  }
  return summary(
    "Purchase still pending",
    "info",
    "Check its status in Services.",
    stubbed
  );
};

/**
 * The unlocked page's link is a one-time token for the shared browser. It is
 * never repeated here, or as an anchor anywhere in this UI.
 */
const fetchSummary = (text: string): ToolSummary => {
  const purchase = urlPurchaseOf(text);
  if (purchase !== null) {
    return purchaseSummary(purchase);
  }
  const refusal = after(text, "Purchase refused:") ?? after(text, "Refused:");
  if (refusal !== null) {
    return summary("Purchase refused", "refused", refusal);
  }
  return (
    spendOutcome(text) ??
    (text.includes("[Paid. The unlocked page")
      ? summary("Paid. The unlocked page went to the shared browser", "ok")
      : summary("Answered without asking to be paid", "info"))
  );
};

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

const statusSummary = (text: string): ToolSummary | null => {
  const status = walletStatusOf(text);
  if (status === null) {
    return null;
  }
  const { totalUsdMicros, windowSpentUsdMicros } = status;
  const detail =
    totalUsdMicros === undefined || totalUsdMicros === null
      ? ""
      : `Balance ${formatUsd(totalUsdMicros)}`;
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

/** What the person is waiting on, by phase, when the ticket has no text yet. */
const SERVICE_PHASE_DETAIL: ReadonlyMap<TaskStatus, string> = new Map([
  ["quoted", "Starting the task. The result will appear in Tools."],
  ["running", "Starting the task. The result will appear in Tools."],
  ["paid", "The provider is working; results will appear in Tools."],
]);

const serviceSummary = (text: string): ToolSummary | null => {
  try {
    const raw: unknown = JSON.parse(text);
    const ticket = Schema.decodeUnknownResult(ServiceTicket)(raw);
    if (ticket._tag === "Success") {
      const task = ticket.success;
      const billing =
        task.priceCreditUnits === undefined
          ? ""
          : ` · ${formatCredits(task.priceCreditUnits)} ${creditChargeWords(task.chargeStatus)}`;
      const headline = `${task.service.replaceAll("_", " ")} · ${statusWords(task.status).label.toLowerCase()}${billing}`;
      if (task.status === "failed" || task.status === "uncertain") {
        return summary(headline, "refused", task.error, task.stubbed);
      }
      return summary(
        headline,
        task.status === "done" ? "ok" : "info",
        task.text.slice(0, 500) ||
          (SERVICE_PHASE_DETAIL.get(task.status) ??
            "Results and files are in Services."),
        task.stubbed
      );
    }
    const catalog = Schema.decodeUnknownResult(ServiceCatalog)(raw);
    if (catalog._tag === "Success") {
      return summary(
        `${catalog.success.services.length} services listed`,
        "info",
        "Prices and availability are in Services.",
        catalog.success.services.some((card) => card.status === "demo")
      );
    }
    const refusal = Schema.decodeUnknownResult(
      Schema.Struct({ v: Schema.Literals([1]), error: Schema.String })
    )(raw);
    return refusal._tag === "Success"
      ? summary("Service request refused", "refused", refusal.success.error)
      : null;
  } catch {
    return null;
  }
};

/** Integer units as a decimal string, at most four fractional digits, no trailing zeros. */
const formatUnits = (units: string, decimals: number): string => {
  const whole = units.padStart(decimals + 1, "0");
  const integer = whole.slice(0, whole.length - decimals) || "0";
  const fraction = whole
    .slice(whole.length - decimals, whole.length - decimals + 4)
    .replace(/0+$/u, "");
  return fraction === "" ? integer : `${integer}.${fraction}`;
};

const OWN_WORDS: ReadonlyMap<string, string> = new Map([
  ["agent_signer", "Froggy's signer"],
  ["agent_smart_account", "Froggy's smart account"],
  ["owner_ethereum", "your owner wallet"],
]);

/** One network as a phrase: "Base: wallet, 0.01 ETH, 12.5 USDC". */
const networkLine = (row: AddressLookupNetwork): string => {
  const name = networkWords(row.network);
  if (row.status === "unavailable") {
    return `${name}: unavailable`;
  }
  const parts: string[] = [];
  if (row.kind === "contract") {
    parts.push(
      row.token?.symbol === null || row.token === null
        ? "contract"
        : `${row.token.symbol} token contract`
    );
  } else {
    parts.push("wallet");
  }
  if (row.nativeBalance !== null && row.nativeBalance !== "0") {
    parts.push(`${formatUnits(row.nativeBalance, 18)} native`);
  }
  if (row.usdc !== null && row.usdc.units !== "0") {
    parts.push(`${formatUnits(row.usdc.units, row.usdc.decimals)} USDC`);
  }
  return `${name}: ${parts.join(", ")}`;
};

/** The free lookup as one line: what the address is, and whose it is. */
const addressLookupSummary = (text: string): ToolSummary | null => {
  try {
    const result = Schema.decodeUnknownResult(AddressLookupResult)(
      JSON.parse(text)
    );
    if (result._tag !== "Success") {
      return null;
    }
    const lookup = result.success;
    const observed = lookup.networks.filter((row) => row.status === "observed");
    const kinds = new Set(observed.map((row) => row.kind));
    let what = "Address not readable on any network";
    if (kinds.has("contract")) {
      what = kinds.has("eoa")
        ? "Contract on some networks, wallet on others"
        : "Contract";
    } else if (kinds.has("eoa")) {
      what = "Wallet, not a token";
    }
    const own = lookup.mine.map((label) => OWN_WORDS.get(label) ?? label);
    const headline = own.length === 0 ? what : `${what} · ${own.join(", ")}`;
    return summary(
      headline,
      observed.length === 0 ? "refused" : "info",
      lookup.networks.map(networkLine).join(" · "),
      lookup.stubbed
    );
  } catch {
    return null;
  }
};

/** Null when the call has no output yet, or said something no parser reads. */
export const summarize = (call: ToolCall): ToolSummary | null => {
  const text = call.output;
  if (text === null) {
    return null;
  }
  switch (call.name) {
    case "address_lookup": {
      return addressLookupSummary(text);
    }
    case "services_list":
    case "service_run":
    case "service_status": {
      return serviceSummary(text);
    }
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
