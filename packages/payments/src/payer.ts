/**
 * The client half: turn a 402 challenge into an `X-PAYMENT` header.
 *
 * The signing seam is `ClientHederaSigner` from `@x402/hedera`, and it is
 * pleasantly small — an account id and one method that returns a
 * partially-signed transfer as base64. That size is what makes the interesting
 * version possible later: the Hiero SDK takes an async signer callback, and
 * `@privy-io/node` can sign a precomputed secp256k1 hash, so this same
 * interface can be backed by a **Privy wallet under a Privy policy** rather
 * than a private key in the environment. One leash across two chains.
 *
 * That is not what ships first. The env-key signer below is the version that
 * works the day a testnet account exists, and swapping it costs one factory.
 */

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  createClientHederaSigner,
  ExactHederaScheme,
  PrivateKey,
} from "@x402/hedera";
import type { ClientHederaSigner } from "@x402/hedera";

import { HEDERA_TESTNET, X402_VERSION } from "./types";
import type { PaymentAttempt, PaymentChallenge, Payer } from "./types";

/**
 * Pick the requirement we can actually satisfy.
 *
 * A challenge may offer several. Choosing the first Hedera `exact` entry rather
 * than simply `accepts[0]` means a server that lists an EVM option first does
 * not make us fail — and, more importantly, that we never build a payload for a
 * scheme we have no signer for and then discover it at settlement.
 */
const DEFAULT_TIMEOUT_SECONDS = 120;

const selectRequirements = (
  challenge: PaymentChallenge
): PaymentRequirements | null => {
  const match = challenge.accepts.find(
    (entry) => entry.network === HEDERA_TESTNET && entry.scheme === "exact"
  );
  if (match === undefined) {
    return null;
  }
  // The one place our decoded challenge becomes the SDK's type. `network` is a
  // CAIP-2 template literal there and a plain string here, and it has just been
  // compared against the Hedera testnet constant — so the narrowing is earned
  // on the line above rather than assumed.
  return {
    amount: match.amount,
    asset: match.asset,
    extra: match.extra ?? {},
    maxTimeoutSeconds: match.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    network: HEDERA_TESTNET,
    payTo: match.payTo,
    scheme: "exact",
  };
};

const encodeHeader = (payload: PaymentPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");

export interface LivePayerOptions {
  readonly accountId: string;
  /** Hedera ECDSA key, `0x`-prefixed. Never reaches the model or the browser. */
  readonly privateKey: string;
}

export const liveHederaPayer = (options: LivePayerOptions): Payer => {
  const signer: ClientHederaSigner = createClientHederaSigner(
    options.accountId,
    PrivateKey.fromStringECDSA(options.privateKey),
    { network: HEDERA_TESTNET }
  );
  const scheme = new ExactHederaScheme(signer);

  return {
    accountId: options.accountId,
    mode: "live",
    network: HEDERA_TESTNET,
    pay: async (challenge) => {
      const requirements = selectRequirements(challenge);
      if (requirements === null) {
        return {
          error:
            "The 402 offered no Hedera testnet `exact` requirement we can pay.",
          header: null,
          requirements: null,
          stubbed: false,
        } satisfies PaymentAttempt;
      }
      try {
        // The scheme returns only the payload fields; `accepted` is ours to
        // attach, because the scheme does not get to decide which of the
        // server's offers we agreed to.
        const result = await scheme.createPaymentPayload(
          X402_VERSION,
          requirements
        );
        const payload: PaymentPayload = {
          accepted: requirements,
          payload: result.payload,
          x402Version: result.x402Version,
        };
        if (result.extensions !== undefined) {
          // Schemes may attach their own extension data (gas sponsoring, for
          // one). It is passed through untouched rather than merged.
          payload.extensions = result.extensions;
        }
        return {
          header: encodeHeader(payload),
          requirements,
          stubbed: false,
        } satisfies PaymentAttempt;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          header: null,
          requirements,
          stubbed: false,
        } satisfies PaymentAttempt;
      }
    },
  };
};

/** The placeholder payer account while no Hedera key exists. */
export const STUB_ACCOUNT_ID = "0.0.0";

/**
 * The stub payer.
 *
 * Builds a structurally correct `PaymentPayload` — right version, right
 * `accepted` requirements — with a transaction field that says what it is. The
 * envelope is exercised end to end; only the signature is missing, which is
 * precisely the part a key supplies.
 */
export const stubHederaPayer = (): Payer => ({
  accountId: STUB_ACCOUNT_ID,
  mode: "stub",
  network: HEDERA_TESTNET,
  pay: async (challenge) => {
    await Promise.resolve();
    const requirements = selectRequirements(challenge);
    if (requirements === null) {
      return {
        error:
          "The 402 offered no Hedera testnet `exact` requirement we can pay.",
        header: null,
        requirements: null,
        stubbed: true,
      } satisfies PaymentAttempt;
    }
    const payload: PaymentPayload = {
      accepted: requirements,
      payload: { transaction: "stub-unsigned-no-hedera-key-configured" },
      x402Version: X402_VERSION,
    };
    return {
      header: encodeHeader(payload),
      requirements,
      stubbed: true,
    } satisfies PaymentAttempt;
  },
});
