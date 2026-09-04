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
export const PaymentChallenge = Schema.Struct({
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
/** x402's identifier for native HBAR. An HTS token id goes here instead. */
export const HBAR_ASSET = "0.0.0";
