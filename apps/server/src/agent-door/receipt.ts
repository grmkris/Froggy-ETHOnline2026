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

import {
  lookupHcsNote,
  lookupHederaTransactionDetails,
  mirrorTransactionId,
} from "@froggy/payments";
import type {
  HcsNoteRecord,
  LedgerTransfer,
  MirrorFetch,
  MirrorVerdict,
} from "@froggy/payments";

import { formatAmount } from "./catalogue";

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
  `https://hashscan.io/${hashscanNetwork(network)}/transaction/${mirrorTransactionId(transactionId)}`;

export const hashscanAccount = (accountId: string, network: string): string =>
  `https://hashscan.io/${hashscanNetwork(network)}/account/${accountId}`;

const hashscanTopic = (topicId: string, network: string): string =>
  `https://hashscan.io/${hashscanNetwork(network)}/topic/${topicId}`;

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

/**
 * The legs that are the payment itself, largest first.
 *
 * The fee legs are small, go to a node account and to the facilitator, and
 * would bury the one line the reader wants. Naming the largest credit and the
 * matching debit says who paid whom without pretending the rest is not there.
 */
const paymentLegs = (
  transfers: readonly LedgerTransfer[]
): { readonly from: LedgerTransfer; readonly to: LedgerTransfer } | null => {
  let to: LedgerTransfer | null = null;
  let from: LedgerTransfer | null = null;
  for (const leg of transfers) {
    if (leg.amount > 0n && (to === null || leg.amount > to.amount)) {
      to = leg;
    }
    if (leg.amount < 0n && (from === null || leg.amount < from.amount)) {
      from = leg;
    }
  }
  return to === null || from === null ? null : { from, to };
};

/** The settlement, said plainly, with the links to check it independently. */
export const describeSettlement = (
  settlement: Settlement,
  network: string
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
      "No matching note was found on the consensus topic. The transfer above is the ledger's own record and stands on its own."
    );
  } else {
    const { note } = settlement;
    lines.push(
      "",
      `Public note #${note.sequenceNumber} on topic ${note.topicId}, written by ${note.payerAccountId}.`,
      note.note.kind === undefined
        ? `It refers to this transaction.`
        : `It records this as ${note.note.kind === "sold" ? "a sale by the seller" : "a purchase by the buyer"}${note.note.ref === undefined || note.note.ref === null ? "" : `, reference ${note.note.ref}`}.`,
      hashscanTopic(note.topicId, network),
      "The topic carries no submit key, so anyone may write to it. The note says what was claimed; the transfer above says what happened."
    );
  }
  return lines.join("\n");
};
