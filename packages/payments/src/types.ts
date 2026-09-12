/**
 * The x402 surface this build needs, and nothing more.
 *
 * `@x402/core` owns the wire types; these are the two roles we play. We are
 * both halves of the flow on purpose: Hedera's track asks for a hosted, paid
 * service *and* an agent that pays one, and the most honest way to demonstrate
 * both is to sell something and then buy it.
 */

import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { Schema } from "effect";

export interface PaidResource {
  readonly description: string;
  /** Price in the asset's smallest unit — tinybars for HBAR, 1e-6 for USDC. */
  readonly units: string;
  readonly url: string;
}

/** The resource-server half: issue a challenge, then verify and settle a payment. */
export interface OracleGate {
  readonly challenge: (resource: PaidResource) => PaymentRequired;
  readonly mode: "live" | "stub";
  /** The account paid, so the server can add itself to its own allowlist. */
  readonly payTo: string;
  /**
   * Learn the facilitator's fee payer, so the 402 can name it.
   *
   * Hedera's exact scheme needs the fee payer in `extra`, and a 402 without it
   * cannot be paid — the payer refuses with "feePayer is required". It is read
   * from the facilitator's `/supported` rather than hardcoded because it has
   * already changed once: the docs still name an account the live service no
   * longer uses. Returns false when it could not be learned.
   */
  readonly refresh: () => Promise<boolean>;
  readonly settle: (
    paymentHeader: string,
    requirements: PaymentRequirements
  ) => Promise<SettleOutcome>;
}

export interface SettleOutcome {
  readonly error?: string;
  readonly ok: boolean;
  readonly stubbed: boolean;
  readonly transactionId: string | null;
}

/**
 * A 402 challenge, as *we* model it.
 *
 * Deliberately our own schema rather than the SDK's `PaymentRequired` type. The
 * body arrives from a seller, so it has to be decoded at the boundary — and the
 * agent that decodes it should not then have to assert its way into a foreign
 * type to hand it on. The one place the two meet is inside the payer, which is
 * the package that owns x402 in the first place.
 */
/**
 * The v2 `resource` block a seller sends once per challenge. The reference
 * client echoes it back inside the payment payload, and at least one seller
 * (You.com) validates the payload strictly, so a payer that drops it is not
 * the client the seller tested against.
 */
export const ChallengeResource = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(2048)),
  description: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(2000))
  ),
  mimeType: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
});

const decodeResource = Schema.decodeUnknownResult(ChallengeResource);

/**
 * The resource block to echo, or nothing. A seller's odd `resource` must not
 * turn a payable challenge into a refusal, so it is carried untyped in the
 * challenge and only narrowed here, at the point of echoing it back.
 */
export const challengeResource = (
  challenge: PaymentChallenge
): typeof ChallengeResource.Type | undefined => {
  if (challenge.resource === undefined) {
    return undefined;
  }
  const decoded = decodeResource(challenge.resource);
  return decoded._tag === "Success" ? decoded.success : undefined;
};

export const PaymentChallenge = Schema.Struct({
  /**
   * Canonical `{url, description, mimeType}` when the seller's block fits,
   * otherwise kept verbatim so an odd block never refuses a payable
   * challenge. The canonical form matters: a saved quote and the card that
   * pays it are compared field for field, and the card only ever carried
   * those three keys.
   */
  resource: Schema.optional(Schema.Union([ChallengeResource, Schema.Unknown])),
  accepts: Schema.Array(
    Schema.Struct({
      amount: Schema.String,
      asset: Schema.String,
      extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      maxTimeoutSeconds: Schema.optional(Schema.Finite),
      network: Schema.String,
      payTo: Schema.String,
      scheme: Schema.String,
    })
  ),
  x402Version: Schema.optional(Schema.Finite),
});

export type PaymentChallenge = typeof PaymentChallenge.Type;

export const decodePaymentChallenge =
  Schema.decodeUnknownResult(PaymentChallenge);

/** The client half: turn a 402 into an `X-PAYMENT` header. */
export interface Payer {
  readonly accountId: string;
  readonly mode: "live" | "stub";
  /** CAIP-2. The one network this payer can pay on; a challenge is matched to it. */
  readonly network: string;
  readonly pay: (challenge: PaymentChallenge) => Promise<PaymentAttempt>;
}

export interface PaymentAttempt {
  readonly error?: string;
  /** Base64 `X-PAYMENT` value, or null when the payment could not be built. */
  readonly header: string | null;
  readonly requirements: PaymentRequirements | null;
  readonly stubbed: boolean;
}

export const X402_VERSION = 2;
export const HEDERA_TESTNET = "hedera:testnet" as const;
export const HEDERA_MAINNET = "hedera:mainnet" as const;
/** The two Hedera networks x402 knows. Which one a deployment pays on is configuration. */
export type HederaNetwork = typeof HEDERA_MAINNET | typeof HEDERA_TESTNET;
export const isHederaNetwork = (network: string): network is HederaNetwork =>
  network === HEDERA_TESTNET || network === HEDERA_MAINNET;
/** x402's identifier for native HBAR. An HTS token id goes here instead. */
export const HBAR_ASSET = "0.0.0";
