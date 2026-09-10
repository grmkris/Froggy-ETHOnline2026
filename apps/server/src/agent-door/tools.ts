/**
 * The three views, and what each of them refuses.
 *
 * What's for sale, buy it, check the receipt. A fourth view would be a sign
 * that this has become a second product rather than a door onto the first
 * one.
 *
 * The refusals matter more than the happy path. A caller here is an agent
 * spending a stranger's own money on a public ledger, and the difference
 * between "you are short 0.04 HBAR" and "payment failed" is the difference
 * between a door and a wall. Every refusal below names the thing that is
 * wrong and the next thing to do about it.
 *
 * Two rules this file exists to keep. It never falls back to another
 * facilitator: the settlement path is part of what is being sold, and a quiet
 * substitution would look like success while being something else. And it
 * never simulates a sale: an unconfigured door refuses, loudly, rather than
 * returning something that could pass for a real settlement.
 */

import {
  assess,
  challengeFrom,
  hederaAccountBalance,
  liveHederaPayer,
  paymentHeaders,
  decodeSettlementHeader,
  settlementHeaderFrom,
} from "@froggy/payments";
import type {
  HederaNetwork,
  MirrorFetch,
  PaymentChallenge,
} from "@froggy/payments";

import {
  describeCatalogue,
  formatAmount,
  readCatalogue,
  refuse,
} from "./catalogue";
import type { DoorFetch, Read, Resource, ServiceCard } from "./catalogue";
import { ACCOUNT_VARIABLE, unconfigured } from "./config";
import type { Door } from "./config";
import {
  describeSettlement,
  hashscanAccount,
  resolveSettlement,
} from "./receipt";

export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly isError: boolean;
}

const say = (text: string, isError = false): ToolResult => ({
  content: [{ type: "text", text }],
  isError,
});

export interface ToolDeps {
  readonly door: Door;
  readonly env: Record<string, string | undefined>;
  readonly fetch?: DoorFetch;
  /** The mirror node is a second port because it answers a different question. */
  readonly mirror?: MirrorFetch;
}

const fetcher = (deps: ToolDeps): DoorFetch =>
  deps.fetch ?? (async (url, init) => await fetch(url, init));

const mirrorer = (deps: ToolDeps): MirrorFetch =>
  deps.mirror ?? (async (url, init) => await fetch(url, init));

/** What's for sale. Free, and works before anything is configured. */
export const catalogueTool = async (deps: ToolDeps): Promise<ToolResult> => {
  const card = await readCatalogue({
    fetch: fetcher(deps),
    url: deps.door.url,
  });
  return card._tag === "refused"
    ? say(card.reason, true)
    : say(describeCatalogue(card.value, deps.door.url));
};

/**
 * Match what the caller asked for against what is sold.
 *
 * A full URL is taken as itself so the door works against any x402 resource,
 * not only ours. Anything else is matched against the catalogue, and an
 * ambiguous match is refused rather than guessed at: buying the wrong thing
 * costs real money.
 */
export const resolveService = (
  card: ServiceCard,
  service: string
): Read<Resource> => {
  const wanted = service.trim();
  if (wanted === "") {
    return refuse("Name a service. froggy_catalogue lists what is for sale.");
  }
  if (wanted.startsWith("https://") || wanted.startsWith("http://")) {
    const exact = card.resources.find((row) => row.url === wanted);
    return {
      _tag: "read",
      value: exact ?? {
        asset: "0.0.0",
        description: "A resource outside the catalogue.",
        method: "GET",
        network: card.resources[0]?.network ?? "hedera:mainnet",
        payTo: "",
        price: "",
        scheme: "exact",
        url: wanted,
      },
    };
  }
  const needle = wanted.toLowerCase();
  const matches = card.resources.filter(
    (row) =>
      row.url.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle)
  );
  const [first] = matches;
  if (first === undefined) {
    return refuse(
      `Nothing called "${service}" is for sale here. froggy_catalogue lists what is.`
    );
  }
  if (matches.length > 1) {
    return refuse(
      `"${service}" matches ${matches.length} services: ${matches.map((row) => row.url).join(", ")}. Name one.`
    );
  }
  return { _tag: "read", value: first };
};

/** Query arguments onto a GET url, leaving one that already has them alone. */
export const withArguments = (
  url: string,
  args: Readonly<Record<string, string>>
): string => {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return url;
  }
  const target = new URL(url);
  for (const [name, value] of entries) {
    target.searchParams.set(name, value);
  }
  return target.toString();
};

/**
 * The shortfall, in the caller's own units, or null when there is none.
 *
 * Only HBAR is checked here. A token balance needs a second mirror query per
 * token, and the facilitator checks association and balance before it settles
 * anyway; refusing on a number we did not read would be worse than letting
 * the seller answer.
 */
const shortfall = async (input: {
  readonly accountId: string;
  readonly amount: string;
  readonly asset: string;
  readonly mirror: MirrorFetch;
  readonly network: string;
}): Promise<string | null> => {
  if (input.asset !== "0.0.0") {
    return null;
  }
  const held = await hederaAccountBalance({
    accountId: input.accountId,
    fetch: input.mirror,
    network: input.network,
  });
  if (held === null) {
    return null;
  }
  const needed = BigInt(input.amount);
  if (held >= needed) {
    return null;
  }
  const missing = (needed - held).toString();
  return [
    `This costs ${formatAmount(input.amount, input.asset, input.network)} and ${input.accountId} holds ${formatAmount(held.toString(), input.asset, input.network)}.`,
    `You are short ${formatAmount(missing, input.asset, input.network)}.`,
    `Fund the account and ask again: ${hashscanAccount(input.accountId, input.network)}`,
    "Nothing was paid, and nothing was created on your behalf.",
  ].join(" ");
};

/**
 * Which offer to take.
 *
 * `assess` carries the reasons, so a refusal here says what the challenge
 * asked for rather than that it was unsupported.
 */
const pickRequirement = (
  challenge: PaymentChallenge,
  network: HederaNetwork
): Read<PaymentChallenge["accepts"][number]> => {
  const options = challenge.accepts.map((requirement) => ({
    requirement,
    verdict: assess(requirement, { payable: [network] }),
  }));
  const usable = options.find((option) => option.verdict.supported);
  if (usable !== undefined) {
    return { _tag: "read", value: usable.requirement };
  }
  const reasons = options
    .map(
      (option) =>
        `${option.requirement.network} ${option.requirement.scheme}: ${option.verdict.reason ?? "not supported"}`
    )
    .join("; ");
  return refuse(
    `This door pays on ${network} only, and the seller did not offer it. ${reasons}. Nothing was paid.`
  );
};

/** What the seller said once the proof was on the request. */
const readAnswer = async (input: {
  readonly card: ServiceCard;
  readonly network: HederaNetwork;
  readonly requirement: PaymentChallenge["accepts"][number];
  readonly response: Response;
  readonly url: string;
}): Promise<ToolResult> => {
  const settlement = decodeSettlementHeader(
    settlementHeaderFrom(input.response.headers)
  );
  const body = await input.response.text();
  const paidLine = [
    `Paid ${formatAmount(input.requirement.amount, input.requirement.asset, input.network)} to ${input.requirement.payTo} on ${input.network}.`,
    settlement === null
      ? "The seller returned no settlement id."
      : `Settlement ${settlement.transactionId} — check it with froggy_receipt.`,
  ].join(" ");

  if (input.response.ok) {
    return say(`${paidLine}\n\n${body}`);
  }
  if (input.response.status === 402) {
    return say(
      [
        `${input.url} asked for payment again after the proof was presented.`,
        `That means the facilitator at ${input.card.facilitator} did not settle it — the settlement path, not the seller, is what did not work.`,
        "This door will not try a different facilitator: the one named in the challenge is part of what is being sold.",
        "No money moved.",
        "",
        body,
      ].join("\n"),
      true
    );
  }
  if (input.response.status === 409) {
    return say(
      [
        `${input.url} is still working on an earlier payment with this same proof and has not finished.`,
        "Ask again in a moment rather than paying twice.",
        "",
        body,
      ].join("\n"),
      true
    );
  }
  return say(
    [
      paidLine,
      `The seller then answered ${input.response.status} and did not deliver.`,
      settlement === null
        ? "Whether money moved is unclear; nothing here should be treated as a refund."
        : "The money moved. Check the settlement above before asking again, and do not re-buy on the strength of this message.",
      "",
      body,
    ].join("\n"),
    true
  );
};

export interface BuyInput {
  /** Optional in the wire schema, so `undefined` is a value it can carry. */
  readonly arguments?: Readonly<Record<string, string>> | undefined;
  readonly service: string;
}

/**
 * Buy it.
 *
 * Ask for the resource, take the price, pay from the caller's own account,
 * ask again with the proof. The signing happens immediately before the retry
 * on purpose: a Hedera transaction carries its own validity window, and a
 * payload built now and sent later is a payload that has expired.
 */
export const buyTool = async (
  deps: ToolDeps,
  input: BuyInput
): Promise<ToolResult> => {
  const refusal = unconfigured(deps.env);
  if (refusal !== null) {
    return say(refusal, true);
  }
  const { wallet } = deps.door;
  if (wallet === null) {
    return say(`${ACCOUNT_VARIABLE} is not set.`, true);
  }

  const fetchImpl = fetcher(deps);
  const card = await readCatalogue({ fetch: fetchImpl, url: deps.door.url });
  if (card._tag === "refused") {
    return say(card.reason, true);
  }
  const resource = resolveService(card.value, input.service);
  if (resource._tag === "refused") {
    return say(resource.reason, true);
  }

  const url = withArguments(resource.value.url, input.arguments ?? {});
  const first = await fetchImpl(url);
  if (first.status !== 402) {
    const body = await first.text();
    return first.ok
      ? say(
          `${url} answered without asking for payment. Nothing was paid.\n\n${body}`
        )
      : say(
          `${url} answered ${first.status}. Nothing was paid.\n\n${body}`,
          true
        );
  }

  const challenge = await challengeFrom(first);
  if (challenge === null) {
    return say(
      `${url} asked for payment but did not describe it in a way this door can read. Nothing was paid.`,
      true
    );
  }
  const chosen = pickRequirement(challenge, deps.door.network);
  if (chosen._tag === "refused") {
    return say(chosen.reason, true);
  }
  const requirement = chosen.value;

  const short = await shortfall({
    accountId: wallet.accountId,
    amount: requirement.amount,
    asset: requirement.asset,
    mirror: mirrorer(deps),
    network: deps.door.network,
  });
  if (short !== null) {
    return say(short, true);
  }

  const payer = liveHederaPayer({
    accountId: wallet.accountId,
    network: deps.door.network,
    privateKey: wallet.privateKey,
  });
  const attempt = await payer.pay(challenge);
  if (attempt.header === null) {
    return say(
      `The payment could not be built: ${attempt.error ?? "no reason given"}. Nothing was paid.`,
      true
    );
  }

  // The proof travels under both the v2 and the v1 header name, so a seller
  // reads whichever one it knows.
  const proof = paymentHeaders(attempt.header);
  const paid = await fetchImpl(url, {
    headers: Object.fromEntries(Object.entries(proof)),
  });
  return await readAnswer({
    card: card.value,
    network: deps.door.network,
    requirement,
    response: paid,
    url,
  });
};

export interface ReceiptInput {
  readonly network?: string | undefined;
  readonly settlement: string;
}

/** Check the receipt. Free, keyless, and works for settlements not your own. */
export const receiptTool = async (
  deps: ToolDeps,
  input: ReceiptInput
): Promise<ToolResult> => {
  const settlementId = input.settlement.trim();
  if (settlementId === "") {
    return say("Give a settlement id, as froggy_buy returns one.", true);
  }
  const network =
    input.network === "hedera:testnet" || input.network === "hedera:mainnet"
      ? input.network
      : deps.door.network;
  const card = await readCatalogue({
    fetch: fetcher(deps),
    url: deps.door.url,
  });
  const resolved = await resolveSettlement({
    fetch: mirrorer(deps),
    network,
    topicId: card._tag === "refused" ? null : card.value.hcsTopic,
    transactionId: settlementId,
  });
  return say(
    describeSettlement(resolved, network),
    resolved.status === "failed"
  );
};
