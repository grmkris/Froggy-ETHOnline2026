/**
 * Ask the network whether a payment happened.
 *
 * A seller that answers 500 after the header was sent, or a facilitator that
 * times out after `/settle`, leaves the buyer not knowing whether money
 * moved. The mirror node knows. Until it answers, the honest status is
 * `uncertain`; the pocket is refunded only when it says the transaction
 * failed, and a spend is called settled only when it says success.
 */

import { mirrorNodeUrlForNetwork } from "@x402/hedera";
import { Schema } from "effect";

export type MirrorVerdict = "failed" | "success" | "unknown";

const Transactions = Schema.Struct({
  transactions: Schema.Array(
    Schema.Struct({
      result: Schema.String,
      entity_id: Schema.optional(Schema.NullOr(Schema.String)),
    })
  ),
});
const decodeTransactions = Schema.decodeUnknownResult(Transactions);

/**
 * `0.0.x@seconds.nanos` as Hedera writes a transaction id, into
 * `0.0.x-seconds-nanos` as the mirror node's REST path wants it.
 */
export const mirrorTransactionId = (transactionId: string): string => {
  const [account, stamp] = transactionId.split("@");
  if (stamp === undefined) {
    return transactionId;
  }
  // Only the timestamp's dot moves; the account's own dots stay.
  return `${account}-${stamp.replace(".", "-")}`;
};

/** The one shape of `fetch` the lookup uses, so a test can hand in a plain function. */
export type MirrorFetch = (
  url: string,
  init: { readonly signal: AbortSignal }
) => Promise<Response>;

export interface MirrorLookup {
  readonly fetch?: MirrorFetch;
  /** CAIP-2. Picks the mirror node; a testnet id on the mainnet mirror is simply unknown. */
  readonly network: string;
  readonly transactionId: string;
}

/**
 * One question, one answer. `unknown` covers a 404 (not yet, or never), a
 * network fault and an unreadable body alike: none of them says money moved,
 * and none says it did not.
 */
export const lookupHederaTransactionDetails = async (
  input: MirrorLookup
): Promise<{
  readonly status: MirrorVerdict;
  readonly entityId: string | null;
}> => {
  const unknown = { status: "unknown", entityId: null } as const;
  const fetchImpl: MirrorFetch = input.fetch ?? fetch;
  const url = `${mirrorNodeUrlForNetwork(input.network)}/api/v1/transactions/${mirrorTransactionId(input.transactionId)}`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return unknown;
    }
    const decoded = decodeTransactions(await response.json());
    if (decoded._tag === "Failure") {
      return unknown;
    }
    const rows = decoded.success.transactions;
    const first = rows.find((row) => row.result === "SUCCESS") ?? rows[0];
    if (first === undefined || first.result === "DUPLICATE_TRANSACTION") {
      return unknown;
    }
    return {
      status: first.result === "SUCCESS" ? "success" : "failed",
      entityId: first.entity_id ?? null,
    };
  } catch {
    return unknown;
  }
};

export const lookupHederaTransaction = async (
  input: MirrorLookup
): Promise<MirrorVerdict> => {
  const result = await lookupHederaTransactionDetails(input);
  return result.status;
};

/**
 * Ask a few times before giving up: a mirror node lags the network by a few
 * seconds, and the first look after a failed answer is usually too early.
 * Sequential on purpose; asking in parallel would only ask too early thrice.
 */
export const reconcileHederaPayment = async (
  input: MirrorLookup & {
    readonly attempts?: number;
    /**
     * Waiting is a port because this function also runs inside the agent door,
     * which is bundled for plain Node where `Bun` does not exist.
     */
    readonly sleep?: (ms: number) => Promise<void>;
    readonly waitMs?: number;
  }
): Promise<MirrorVerdict> => {
  const attempts = input.attempts ?? 3;
  const waitMs = input.waitMs ?? 2000;
  const sleep =
    input.sleep ??
    (async (ms: number) => {
      await Bun.sleep(ms);
    });
  const ask = async (attempt: number): Promise<MirrorVerdict> => {
    const verdict = await lookupHederaTransaction(input);
    if (verdict !== "unknown" || attempt + 1 >= attempts) {
      return verdict;
    }
    await sleep(waitMs);
    return await ask(attempt + 1);
  };
  return await ask(0);
};

const Account = Schema.Struct({
  balance: Schema.Struct({ balance: Schema.Finite }),
});
const decodeAccount = Schema.decodeUnknownResult(Account);

/**
 * What an account holds, in tinybars, from the mirror node; null when the
 * mirror does not answer or does not know the account. A display figure:
 * nothing spends on the strength of it.
 */
export const hederaAccountBalance = async (input: {
  readonly accountId: string;
  readonly fetch?: MirrorFetch;
  readonly network: string;
}): Promise<bigint | null> => {
  const fetchImpl: MirrorFetch = input.fetch ?? fetch;
  const url = `${mirrorNodeUrlForNetwork(input.network)}/api/v1/accounts/${encodeURIComponent(input.accountId)}`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return null;
    }
    const decoded = decodeAccount(await response.json());
    return decoded._tag === "Success"
      ? BigInt(Math.round(decoded.success.balance.balance))
      : null;
  } catch {
    return null;
  }
};

const TopicMessages = Schema.Struct({
  links: Schema.optional(
    Schema.Struct({ next: Schema.optional(Schema.NullOr(Schema.String)) })
  ),
  messages: Schema.Array(
    Schema.Struct({
      consensus_timestamp: Schema.String,
      message: Schema.String,
      payer_account_id: Schema.String,
      sequence_number: Schema.Finite,
    })
  ),
});
const decodeTopicMessages = Schema.decodeUnknownResult(TopicMessages);

/**
 * A note as read back from the topic, rather than as written.
 *
 * The topic carries no submit key, so a message may be anything at all. Only
 * the transaction id is required, because that is what a note is for; the rest
 * is optional so that a note written by an older version, or by a stranger,
 * still reads rather than disappearing.
 */
export const TopicNote = Schema.Struct({
  amount: Schema.optional(Schema.String),
  asset: Schema.optional(Schema.String),
  at: Schema.optional(Schema.Finite),
  kind: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.NullOr(Schema.String)),
  transactionId: Schema.String,
});
export type TopicNote = typeof TopicNote.Type;

const decodeNoteJson = Schema.decodeUnknownResult(
  Schema.fromJsonString(TopicNote)
);

/** Base64 in, note out. Both steps are a stranger's input, so both may fail. */
const readNote = (message: string): TopicNote | null => {
  const decoded = decodeNoteJson(
    Buffer.from(message, "base64").toString("utf-8")
  );
  return decoded._tag === "Success" ? decoded.success : null;
};

/** One page of topic messages, or null for anything that is not one. */
const readPage = async (
  fetchImpl: MirrorFetch,
  url: string
): Promise<typeof TopicMessages.Type | null> => {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return null;
    }
    const decoded = decodeTopicMessages(await response.json());
    return decoded._tag === "Success" ? decoded.success : null;
  } catch {
    return null;
  }
};

/** A settlement note as it sits on the topic, with the coordinates to cite it. */
export interface HcsNoteRecord {
  readonly consensusTimestamp: string;
  readonly note: TopicNote;
  readonly payerAccountId: string;
  readonly sequenceNumber: number;
  readonly topicId: string;
}

export interface HcsNoteLookup {
  readonly fetch?: MirrorFetch;
  /** Messages per page. The mirror node caps this at 100. */
  readonly limit?: number;
  readonly network: string;
  /** How far back to look before giving up. */
  readonly pages?: number;
  readonly topicId: string;
  readonly transactionId: string;
}

/**
 * Find the public note that matches a settlement.
 *
 * The receipt view is the one place a stranger can check our audit trail
 * without trusting us, so this reads the topic the way they would: the public
 * mirror node, newest first, matching on the transaction id the settlement
 * header carried.
 *
 * A note is evidence that someone claimed a settlement; the transaction lookup
 * beside it is evidence that one happened. Neither stands alone, because the
 * topic has no submit key.
 */
export const lookupHcsNote = async (
  input: HcsNoteLookup
): Promise<HcsNoteRecord | null> => {
  const fetchImpl: MirrorFetch = input.fetch ?? fetch;
  const base = mirrorNodeUrlForNetwork(input.network);
  const wanted = mirrorTransactionId(input.transactionId);
  const limit = input.limit ?? 100;

  const read = async (
    path: string,
    remaining: number
  ): Promise<HcsNoteRecord | null> => {
    if (remaining <= 0) {
      return null;
    }
    const page = await readPage(fetchImpl, `${base}${path}`);
    if (page === null) {
      return null;
    }
    for (const row of page.messages) {
      const note = readNote(row.message);
      if (note !== null && mirrorTransactionId(note.transactionId) === wanted) {
        return {
          consensusTimestamp: row.consensus_timestamp,
          note,
          payerAccountId: row.payer_account_id,
          sequenceNumber: Math.round(row.sequence_number),
          topicId: input.topicId,
        };
      }
    }
    const next = page.links?.next;
    return next === undefined || next === null || next === ""
      ? null
      : await read(next, remaining - 1);
  };

  return await read(
    `/api/v1/topics/${encodeURIComponent(input.topicId)}/messages?limit=${limit}&order=desc`,
    input.pages ?? 5
  );
};
