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

import { formatAmount } from "@froggy/domain";
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
  boundedText,
  describeCatalogue,
  readCatalogue,
  refuse,
  SELLER_TIMEOUT_MS,
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
  const body = await boundedText(input.response);
  // A seller running against a stub says so twice: in the header the app sets
  // and in the shape of the id itself. Either is enough to stop this reading
  // as a real settlement, which is the repository's loudest rule.
  const stubbed =
    input.response.headers.get("x-froggy-stubbed") === "true" ||
    (settlement !== null && settlement.transactionId.startsWith("stub-"));
  const paidLine = [
    `Paid ${formatAmount(input.requirement.amount, input.requirement.asset, input.network)} to ${input.requirement.payTo} on ${input.network}.`,
    settlement === null
      ? "The seller returned no settlement id."
      : `Settlement ${settlement.transactionId} — check it with froggy_receipt.`,
  ].join(" ");
  const stubLine = stubbed
    ? "\n\nThis seller is running in stub mode: it says so itself, and the settlement id above is not a Hedera transaction. Nothing was really paid, and nothing here is evidence that it was."
    : "";

  if (input.response.ok) {
    return say(`${paidLine}${stubLine}\n\n${body}`, stubbed);
  }
  if (input.response.status === 402) {
    return say(
      [
        `${input.url} asked for payment again after the proof was presented, so the payment was not accepted.`,
        `Either the facilitator at ${input.card.facilitator} could not settle it, or it settled nothing because the proof itself was refused — a key of the wrong type, an account that does not hold the asset, or an offer that had expired. The seller's own words are below.`,
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
  /** The most the caller will pay, in the asset's smallest units. */
  readonly maxAmount?: string | undefined;
  readonly service: string;
}

/**
 * What the caller was shown against what the seller is now asking.
 *
 * The catalogue is the only price a caller has agreed to before this call, so
 * a 402 that asks for something else is a drift the caller has to hear about
 * rather than a number to pay. This is what makes "the price is in the
 * challenge, not in our documentation" safe: the two are compared, and the
 * purchase stops when they disagree.
 *
 * A resource the caller named by full URL has no catalogue row to compare
 * against, so only `maxAmount` applies there — and the refusal says so.
 */
const priceObjection = (input: {
  readonly listed: Resource | null;
  readonly maxAmount: string | undefined;
  readonly network: string;
  readonly requirement: PaymentChallenge["accepts"][number];
}): string | null => {
  const { listed, requirement } = input;
  const asking = formatAmount(
    requirement.amount,
    requirement.asset,
    input.network
  );
  if (input.maxAmount !== undefined && input.maxAmount.trim() !== "") {
    let ceiling: bigint | null = null;
    try {
      ceiling = BigInt(input.maxAmount.trim());
    } catch {
      return `maxAmount is "${input.maxAmount}", which is not a whole number of the asset's smallest units. Nothing was paid.`;
    }
    if (BigInt(requirement.amount) > ceiling) {
      return [
        `${asking} is more than the ${formatAmount(ceiling.toString(), requirement.asset, input.network)} you said you would pay.`,
        "Nothing was paid, and nothing was created on your behalf.",
      ].join(" ");
    }
  }
  if (listed === null || listed.price === "") {
    return null;
  }
  if (
    listed.price !== requirement.amount ||
    listed.asset !== requirement.asset
  ) {
    return [
      `The catalogue lists this at ${formatAmount(listed.price, listed.asset, listed.network)} and the seller is now asking ${asking}.`,
      "This door will not pay a price the caller was not shown. Read froggy_catalogue again and ask for it by name if the new price is acceptable.",
      "Nothing was paid.",
    ].join(" ");
  }
  if (listed.payTo !== "" && listed.payTo !== requirement.payTo) {
    return [
      `The catalogue says this is paid to ${listed.payTo} and the seller is now asking to be paid to ${requirement.payTo}.`,
      "That is a different recipient from the one advertised, so nothing was paid.",
    ].join(" ");
  }
  return null;
};

/**
 * Ask the seller for the thing, and come back with the price or with the
 * sentence saying why there is not one.
 *
 * Redirects are not followed. The next request carries a signed payment, and
 * following a redirect would hand it to a host the caller never named — so the
 * new address is reported and the caller decides.
 */
type Priced =
  | { readonly _tag: "priced"; readonly challenge: PaymentChallenge }
  /** Answered without asking for payment. Not a failure; nothing was paid. */
  | { readonly _tag: "free"; readonly text: string }
  | { readonly _tag: "refused"; readonly reason: string };

const askForPrice = async (input: {
  readonly argued: boolean;
  readonly fetch: DoorFetch;
  readonly url: string;
}): Promise<Priced> => {
  const { url } = input;
  const first = await input.fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(SELLER_TIMEOUT_MS),
  });
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get("location");
    return {
      _tag: "refused",
      reason: [
        `${url} answered ${first.status} and pointed somewhere else${location === null ? "" : `: ${location}`}.`,
        "This door does not follow a redirect while carrying a payment. Ask for that address directly if it is one you meant to buy from.",
        "Nothing was paid.",
      ].join(" "),
    };
  }
  if (first.status === 402) {
    const challenge = await challengeFrom(first);
    return challenge === null
      ? {
          _tag: "refused",
          reason: `${url} asked for payment but did not describe it in a way this door can read. Nothing was paid.`,
        }
      : { _tag: "priced", challenge };
  }
  const body = await boundedText(first);
  if (first.ok) {
    return {
      _tag: "free",
      text: `${url} answered without asking for payment. Nothing was paid.\n\n${body}`,
    };
  }
  // Some resources take no arguments at all and answer 400 to any query
  // string. The caller supplied them, so name that as the first thing to try
  // rather than leaving them to read it out of the seller's prose.
  const suspect =
    first.status === 400 && input.argued
      ? " This resource may take no arguments; try it again with none."
      : "";
  return {
    _tag: "refused",
    reason: `${url} answered ${first.status}. Nothing was paid.${suspect}\n\n${body}`,
  };
};

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
  const asked = await askForPrice({
    argued: Object.keys(input.arguments ?? {}).length > 0,
    fetch: fetchImpl,
    url,
  });
  if (asked._tag === "refused") {
    return say(asked.reason, true);
  }
  if (asked._tag === "free") {
    return say(asked.text);
  }
  const { challenge } = asked;
  const chosen = pickRequirement(challenge, deps.door.network);
  if (chosen._tag === "refused") {
    return say(chosen.reason, true);
  }
  const requirement = chosen.value;

  const objection = priceObjection({
    listed: card.value.resources.includes(resource.value)
      ? resource.value
      : null,
    maxAmount: input.maxAmount,
    network: deps.door.network,
    requirement,
  });
  if (objection !== null) {
    return say(objection, true);
  }

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
  // Only the offer that was assessed, priced against the catalogue and
  // balance-checked is handed on. The payer picks from `accepts` with a laxer
  // rule than `assess`, so passing the whole challenge would let it sign an
  // offer this function never looked at — and then report the one it did.
  const attempt = await payer.pay({ ...challenge, accepts: [requirement] });
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
    redirect: "manual",
    signal: AbortSignal.timeout(SELLER_TIMEOUT_MS),
  });
  return await readAnswer({
    card: card.value,
    network: deps.door.network,
    // What was signed, not what was chosen. They are the same by construction
    // above; saying so from the payer's own answer keeps it that way.
    requirement: attempt.requirements ?? requirement,
    response: paid,
    url,
  });
};

/** Which of the three reasons there was no topic to search. */
const whyNoTopic = (
  cardUnreadable: boolean,
  doorNetwork: string,
  asked: string
): string => {
  if (cardUnreadable) {
    return "this door could not read the seller's card, so it does not know which topic to look on";
  }
  if (asked !== doorNetwork) {
    return `this door is configured for ${doorNetwork} and knows no topic for ${asked}`;
  }
  return "the seller publishes no consensus topic";
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
  // The topic comes from the card, and the card describes the network the
  // door points at. Asked about the other network, there is no topic this
  // door knows — and saying "no note was found" about a topic nobody looked
  // at would be the receipt view telling the exact kind of half-truth it
  // exists to expose.
  const topicId =
    card._tag === "refused" || network !== deps.door.network
      ? null
      : card.value.hcsTopic;
  const resolved = await resolveSettlement({
    fetch: mirrorer(deps),
    network,
    topicId,
    transactionId: settlementId,
  });
  return say(
    describeSettlement(resolved, network, {
      topicKnown: topicId !== null && topicId !== "",
      why: whyNoTopic(card._tag === "refused", deps.door.network, network),
    }),
    resolved.status === "failed"
  );
};
