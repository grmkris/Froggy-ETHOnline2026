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

/** For the authentication boundary, where a bad value is an ordinary refusal. */
export const decodeUserId = Schema.decodeUnknownResult(UserId);

/**
 * For values already known to be DIDs — a database column this process wrote,
 * or a test fixture. Throws, because reaching it means the invariant is
 * already broken and continuing would spread the damage. Same idiom as
 * `usdMicros`.
 */
export const userId = Schema.decodeUnknownSync(UserId);

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
