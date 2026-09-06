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
  transactions: Schema.Array(Schema.Struct({ result: Schema.String })),
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
export const lookupHederaTransaction = async (
  input: MirrorLookup
): Promise<MirrorVerdict> => {
  const fetchImpl: MirrorFetch = input.fetch ?? fetch;
  const url = `${mirrorNodeUrlForNetwork(input.network)}/api/v1/transactions/${mirrorTransactionId(input.transactionId)}`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return "unknown";
    }
    const decoded = decodeTransactions(await response.json());
    if (decoded._tag === "Failure") {
      return "unknown";
    }
    const [first] = decoded.success.transactions;
    if (first === undefined) {
      return "unknown";
    }
    return first.result === "SUCCESS" ? "success" : "failed";
  } catch {
    return "unknown";
  }
};

/**
 * Ask a few times before giving up: a mirror node lags the network by a few
 * seconds, and the first look after a failed answer is usually too early.
 * Sequential on purpose; asking in parallel would only ask too early thrice.
 */
export const reconcileHederaPayment = async (
  input: MirrorLookup & { readonly attempts?: number; readonly waitMs?: number }
): Promise<MirrorVerdict> => {
  const attempts = input.attempts ?? 3;
  const waitMs = input.waitMs ?? 2000;
  const ask = async (attempt: number): Promise<MirrorVerdict> => {
    const verdict = await lookupHederaTransaction(input);
    if (verdict !== "unknown" || attempt + 1 >= attempts) {
      return verdict;
    }
    await Bun.sleep(waitMs);
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
