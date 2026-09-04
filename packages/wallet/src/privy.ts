/**
 * Privy, server side.
 *
 * Two jobs: say who a caller is, and say which addresses are theirs.
 *
 * There is no user table. Privy's DID *is* the identity — the same choice
 * humanhook made, and for the same reason: a local users table is a second
 * source of truth about who someone is, and the first time the two disagree you
 * have an authentication bug rather than a data bug.
 *
 * Note the two tokens. The **access token** answers "who is this" and is
 * verified against a cached JWKS with no network call. The **identity token**
 * carries the user's linked accounts, so reading an address from it is one
 * verified parse rather than a round trip to Privy on every request. The SDK's
 * public surface is built around exactly this split — `users().get()` takes an
 * identity token, not a DID — and following it avoids reaching into the
 * generated resource client for a by-id lookup that is not part of the API.
 */

import type { LinkedAccount } from "@privy-io/node";
import { PrivyClient } from "@privy-io/node";

/**
 * The two addresses, kept distinct on purpose.
 *
 * `smart` is where money is. `signer` is the embedded EOA — what a
 * `personal_sign` recovers to. They are not interchangeable: a smart account's
 * `isValidSignature` wraps the digest in its own domain, so verifying a
 * signature against the smart address fails even when the signature is genuine.
 * Conflating them is a bug that only appears once a smart wallet exists, which
 * is well after the code that conflated them looked fine.
 */
export interface WalletAddresses {
  readonly signer: string | null;
  readonly smart: string | null;
}

export interface PrivyServer {
  /** Addresses carried by an identity token, or nulls when it is unusable. */
  readonly addresses: (identityToken: string) => Promise<WalletAddresses>;
  readonly mode: "live" | "stub";
  /** Returns the Privy DID, or null when the token is absent or invalid. */
  readonly verify: (accessToken: string) => Promise<string | null>;
}

/**
 * The address on a linked account, if it has one.
 *
 * `LinkedAccount` is a union covering email, phone, OAuth and wallets, so the
 * property check is narrowing the union rather than inspecting untyped input —
 * the SDK's own type is the contract being read here.
 */
const addressOf = (account: LinkedAccount): string | null =>
  "address" in account ? account.address : null;

const pickAddresses = (accounts: readonly LinkedAccount[]): WalletAddresses => {
  const signer =
    accounts
      .filter((account) => account.type === "wallet")
      .map(addressOf)
      .find((address) => address !== null) ?? null;
  const smart =
    accounts
      .filter((account) => account.type === "smart_wallet")
      .map(addressOf)
      .find((address) => address !== null) ?? null;
  // Money falls back to the signer when there is no smart account, because a
  // user with only an embedded EOA still has one address that holds funds.
  return { signer, smart: smart ?? signer };
};

const NO_ADDRESSES: WalletAddresses = { signer: null, smart: null };

export interface LivePrivyOptions {
  readonly appId: string;
  readonly appSecret: string;
}

export const livePrivyServer = (options: LivePrivyOptions): PrivyServer => {
  const client = new PrivyClient({
    appId: options.appId,
    appSecret: options.appSecret,
  });

  return {
    addresses: async (identityToken) => {
      if (identityToken.trim() === "") {
        return NO_ADDRESSES;
      }
      try {
        const user = await client.users().get({ id_token: identityToken });
        return pickAddresses(user.linked_accounts);
      } catch {
        // A stale identity token means "we do not know your address yet", not
        // an error worth failing a page render over. The pane shows no address.
        return NO_ADDRESSES;
      }
    },

    mode: "live",

    verify: async (accessToken) => {
      try {
        const claims = await client
          .utils()
          .auth()
          .verifyAccessToken(accessToken);
        return claims.user_id;
      } catch {
        // A bad token is an ordinary event — an expired session, a stale tab —
        // and the caller decides whether that is a 401 or an anonymous read.
        return null;
      }
    },
  };
};

/**
 * The stub.
 *
 * Accepts any non-empty token and derives a stable pseudo-DID from it, so a
 * whole session — mandate, spend, ledger, receipts — is exercisable before a
 * Privy app id exists. It refuses an empty token rather than inventing an
 * anonymous user, because "logged out" has to stay reachable in the UI.
 *
 * The address it returns is a hash, and it is meant to look like one. A stub
 * that produced a plausible-looking wallet address would be indistinguishable
 * from a live one in a screenshot, which is exactly the confusion this whole
 * stub/live split exists to prevent.
 */
const digest = (input: string): string =>
  new Bun.CryptoHasher("sha256").update(input).digest("hex");

export const stubPrivyServer = (): PrivyServer => ({
  addresses: async (identityToken) => {
    await Promise.resolve();
    if (identityToken.trim() === "") {
      return NO_ADDRESSES;
    }
    const address = `0x${digest(identityToken).slice(0, 40)}`;
    return { signer: address, smart: address };
  },
  mode: "stub",
  verify: async (accessToken) => {
    await Promise.resolve();
    if (accessToken.trim() === "") {
      return null;
    }
    return `did:stub:${digest(accessToken).slice(0, 24)}`;
  },
});
