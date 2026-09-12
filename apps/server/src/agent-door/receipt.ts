/**
 * Whether a settlement really happened.
 *
 * This is the view that turns our audit trail from a claim in a README into
 * something a stranger can run. It costs nothing, needs no key, and works for
 * any settlement — including ones the caller did not make and ones we did not
 * write — because a receipt you can only check for your own payments is not a
 * receipt, it is a confirmation message.
 *
 * Two sources, deliberately: the ledger says what moved, and the consensus
 * topic says what was claimed about it. The topic has no submit key, so the
 * note alone proves nothing; the pair is the evidence.
 */

import { formatAmount } from "@froggy/domain";
import {
  HBAR_ASSET,
  lookupHcsNote,
  lookupHederaTransactionDetails,
} from "@froggy/payments";
import type {
  HcsNoteRecord,
  LedgerTransfer,
  MirrorFetch,
  MirrorVerdict,
} from "@froggy/payments";

import { clipField } from "./catalogue";

export interface Settlement {
  readonly note: HcsNoteRecord | null;
  readonly status: MirrorVerdict;
  readonly transactionId: string;
  readonly transfers: readonly LedgerTransfer[];
  readonly when: string | null;
}

/** `hedera:mainnet` into the segment HashScan puts in a path. */
const hashscanNetwork = (network: string): string =>
  network === "hedera:testnet" ? "testnet" : "mainnet";

const hashscanTransaction = (transactionId: string, network: string): string =>
  `https://hashscan.io/${hashscanNetwork(network)}/transaction/${encodeURIComponent(transactionId)}`;

export const hashscanAccount = (accountId: string, network: string): string =>
  `https://hashscan.io/${hashscanNetwork(network)}/account/${encodeURIComponent(accountId)}`;

const hashscanTopic = (topicId: string, network: string): string =>
  `https://hashscan.io/${hashscanNetwork(network)}/topic/${encodeURIComponent(topicId)}`;

/**
 * Look the settlement up on both sources.
 *
 * The topic is only consulted when there is one to consult; a settlement on a
 * seller who keeps no notes is still a settlement, and saying so is more
 * honest than reporting a missing note as a fault.
 */
export const resolveSettlement = async (input: {
  readonly fetch?: MirrorFetch;
  readonly network: string;
  readonly topicId?: string | null;
  readonly transactionId: string;
}): Promise<Settlement> => {
  const fetchImpl: MirrorFetch =
    input.fetch ?? (async (url, init) => await fetch(url, init));
  const details = await lookupHederaTransactionDetails({
    fetch: fetchImpl,
    network: input.network,
    transactionId: input.transactionId,
  });
  const topicId = input.topicId ?? null;
  const note =
    topicId === null || topicId === ""
      ? null
      : await lookupHcsNote({
          fetch: fetchImpl,
          // The ledger has just told us when this settled, and the note was
          // written moments after. Starting there rather than at the newest
          // message is what keeps an old settlement checkable on a busy topic.
          near: details.consensusTimestamp,
          network: input.network,
          topicId,
          transactionId: input.transactionId,
        });
  return {
    note,
    status: details.status,
    transactionId: input.transactionId,
    transfers: details.transfers,
    when: details.consensusTimestamp,
  };
};

/** Consensus timestamp `1789020056.198748459` as a time a person reads. */
const readTime = (consensusTimestamp: string | null): string | null => {
  if (consensusTimestamp === null) {
    return null;
  }
  const [seconds] = consensusTimestamp.split(".");
  const parsed = Number(seconds);
  return Number.isFinite(parsed) ? new Date(parsed * 1000).toISOString() : null;
};

interface Legs {
  readonly from: LedgerTransfer;
  readonly to: LedgerTransfer;
}

/**
 * The legs that are the payment itself.
 *
 * Two things have to be right here, and the first version got both wrong by
 * reaching for the largest leg in the list.
 *
 * A transaction's legs are not all in one asset. An HTS payment moves the
 * token *and* HBAR, because the facilitator pays the network fee out of the
 * same transaction. Comparing raw amounts across assets makes a 0.001 HBAR
 * fee "larger" than a 0.05 USDC payment. So the asset is chosen first: a
 * transaction that moves a token is a token payment, and the HBAR beside it is
 * the fee.
 *
 * And the largest leg is not the payment when the price is below the fee —
 * which is the case this rail exists for. What distinguishes a payment is that
 * it balances: one account is debited exactly what another is credited. Fees
 * do not, because one debit is split across the node, the fee account and the
 * staking accounts. So the pair is looked for, and only a transaction with no
 * balanced pair at all falls back to the largest of each.
 */
const paymentLegs = (transfers: readonly LedgerTransfer[]): Legs | null => {
  const token = transfers.find((leg) => leg.asset !== HBAR_ASSET);
  const asset = token?.asset ?? HBAR_ASSET;
  const legs = transfers.filter((leg) => leg.asset === asset);
  const credits = legs
    .filter((leg) => leg.amount > 0n)
    .toSorted((left, right) => (right.amount > left.amount ? 1 : -1));
  const debits = legs.filter((leg) => leg.amount < 0n);

  for (const to of credits) {
    const from = debits.find((leg) => leg.amount === -to.amount);
    if (from !== undefined) {
      return { from, to };
    }
  }

  const [to] = credits;
  const [from] = debits.toSorted((left, right) =>
    right.amount < left.amount ? 1 : -1
  );
  return to === undefined || from === undefined ? null : { from, to };
};

/**
 * What the note claims, in its own terms.
 *
 * Anyone may write to the topic, so `kind` is a stranger's string and not an
 * enumeration. The two this repository writes are rendered as English; a third
 * is quoted rather than rounded to the nearer of the two, because reporting an
 * unrecognised claim as a recognised one is precisely the failure this view
 * exists to make impossible.
 */
const describeKind = (
  kind: string | undefined,
  ref: string | null | undefined
): string => {
  const reference =
    ref === undefined || ref === null
      ? ""
      : `, reference ${clipField(ref, 80)}`;
  if (kind === undefined) {
    return "It refers to this transaction.";
  }
  if (kind === "sold" || kind === "paid") {
    return `It records this as ${kind === "sold" ? "a sale by the seller" : "a purchase by the buyer"}${reference}.`;
  }
  return `It records this with a kind this door does not recognise, "${clipField(kind, 80)}"${reference}.`;
};

/** Why there is no note below: because none was found, or because none was sought. */
export interface TopicContext {
  readonly topicKnown: boolean;
  /** Said only when the topic was not known. */
  readonly why: string;
}

const LOOKED_AND_FOUND_NOTHING: TopicContext = {
  topicKnown: true,
  why: "",
};

/** The settlement, said plainly, with the links to check it independently. */
export const describeSettlement = (
  settlement: Settlement,
  network: string,
  topic: TopicContext = LOOKED_AND_FOUND_NOTHING
): string => {
  const lines: string[] = [];
  const legs = paymentLegs(settlement.transfers);
  const when = readTime(settlement.when);

  if (settlement.status === "success" && legs !== null) {
    const amount = formatAmount(
      legs.to.amount.toString(),
      legs.to.asset,
      network
    );
    lines.push(
      `Settled. ${amount} moved from ${legs.from.accountId} to ${legs.to.accountId} on ${network}${when === null ? "" : ` at ${when}`}.`
    );
  } else if (settlement.status === "success") {
    lines.push(
      `Settled on ${network}${when === null ? "" : ` at ${when}`}, but the ledger returned no transfer legs to read.`
    );
  } else if (settlement.status === "failed") {
    lines.push(
      `The ledger recorded this transaction and it did not succeed. No money moved.`
    );
  } else {
    lines.push(
      `The mirror node does not know this transaction. That is not the same as saying it failed: a settlement takes a few seconds to appear, and an id from the other network will never appear here at all.`
    );
  }

  lines.push(
    `Transaction ${settlement.transactionId}`,
    hashscanTransaction(settlement.transactionId, network)
  );

  if (settlement.note === null) {
    lines.push(
      "",
      topic.topicKnown
        ? "No matching note was found on the consensus topic. The transfer above is the ledger's own record and stands on its own."
        : `No consensus topic was searched, because ${topic.why}. The transfer above is the ledger's own record and stands on its own.`
    );
  } else {
    const { note } = settlement;
    lines.push(
      "",
      `Public note #${note.sequenceNumber} on topic ${note.topicId}, written by ${note.payerAccountId}.`,
      describeKind(note.note.kind, note.note.ref),
      hashscanTopic(note.topicId, network),
      "The topic carries no submit key, so anyone may write to it. The note says what was claimed; the transfer above says what happened."
    );
  }
  return lines.join("\n");
};
