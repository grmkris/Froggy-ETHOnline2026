/**
 * Who a caller is.
 *
 * Privy's DID is the identity, and it is the only one. There is no second
 * account system beside it: a user row is keyed by this value, so there is
 * never a moment where two sources of truth about "who is this" can disagree.
 *
 * The format belongs to Privy (`did:privy:<id>`), so this is a branded string
 * rather than one of our TypeIDs — inventing our own id for a user would mean
 * carrying a mapping we do not need.
 */

import { Schema } from "effect";

export const UserId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^did:[a-z0-9]+:[A-Za-z0-9._-]+$/u, {
      message: "Expected a Privy DID such as did:privy:abc123",
    })
  ),
  Schema.brand("UserId")
);

export type UserId = typeof UserId.Type;

export const decodeUserId = Schema.decodeUnknownResult(UserId);

/**
 * A verified caller.
 *
 * `wallet` is filled once the server has read the user's Privy wallet; it is
 * absent for the first request of a new session, which is why it is nullable
 * rather than required — an unauthenticated *caller* is refused at the door, but
 * an authenticated caller without a wallet yet is an ordinary state.
 */
export interface Caller {
  readonly userId: UserId;
  readonly walletAddress: string | null;
}
