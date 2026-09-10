/**
 * What the caller told us, and what they did not.
 *
 * The door runs on a stranger's machine and signs with a stranger's key. That
 * key arrives in the process environment and never leaves it: it is not
 * logged, not written down, and not echoed into a tool result. Two of the
 * three views need no key at all, so a caller who has installed the door and
 * configured nothing must still be able to read the catalogue and check a
 * receipt — which is why the wallet is a separate thing from the rest of the
 * configuration rather than a precondition for having any.
 */

import { HEDERA_MAINNET, HEDERA_TESTNET } from "@froggy/payments";
import type { HederaNetwork } from "@froggy/payments";

/** Where the door points when the caller says nothing. */
const DEFAULT_URL = "https://app-production-58dd.up.railway.app";

interface Wallet {
  readonly accountId: string;
  readonly privateKey: string;
}

export interface Door {
  readonly network: HederaNetwork;
  /** Origin only, no trailing slash. */
  readonly url: string;
  /** Null when the caller has configured no key. Not an error until they buy. */
  readonly wallet: Wallet | null;
}

export const ACCOUNT_VARIABLE = "FROGGY_HEDERA_ACCOUNT_ID";
const KEY_VARIABLE = "FROGGY_HEDERA_PRIVATE_KEY";

/** A Hedera account id, `0.0.x`. Anything else is not one. */
const ACCOUNT_PATTERN = /^\d+\.\d+\.\d+$/u;

const readNetwork = (value: string | undefined): HederaNetwork =>
  value === HEDERA_TESTNET ? HEDERA_TESTNET : HEDERA_MAINNET;

const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

/**
 * Read the environment once, at start.
 *
 * A half-configured wallet — an account with no key, or a key with no account —
 * is treated as no wallet, because signing with half of one is not a thing that
 * can be attempted. `unconfigured` below says which half is missing.
 */
export const readDoor = (env: Record<string, string | undefined>): Door => {
  const accountId = env[ACCOUNT_VARIABLE]?.trim() ?? "";
  const privateKey = env[KEY_VARIABLE]?.trim() ?? "";
  const configured = accountId !== "" && privateKey !== "";
  return {
    network: readNetwork(env["FROGGY_NETWORK"]?.trim()),
    url: trimTrailingSlash(env["FROGGY_URL"]?.trim() ?? DEFAULT_URL),
    wallet: configured ? { accountId, privateKey } : null,
  };
};

/**
 * Why the door cannot pay, in the caller's own terms.
 *
 * Null when it can. This is deliberately a sentence rather than a code: the
 * caller is an agent reading tool output, and the next thing it needs is the
 * name of the variable to set.
 */
export const unconfigured = (
  env: Record<string, string | undefined>
): string | null => {
  const accountId = env[ACCOUNT_VARIABLE]?.trim() ?? "";
  const privateKey = env[KEY_VARIABLE]?.trim() ?? "";
  const missing = [
    accountId === ""
      ? `${ACCOUNT_VARIABLE}, the Hedera account you want to pay from`
      : null,
    privateKey === ""
      ? `${KEY_VARIABLE}, that account's ECDSA private key`
      : null,
  ].filter((name) => name !== null);
  if (missing.length > 0) {
    return `This door is not configured to pay. Set ${missing.join(" and ")}. Nothing was bought and nothing was simulated.`;
  }
  if (!ACCOUNT_PATTERN.test(accountId)) {
    return `${ACCOUNT_VARIABLE} is "${accountId}", which is not a Hedera account id. It should look like 0.0.12345.`;
  }
  return null;
};
