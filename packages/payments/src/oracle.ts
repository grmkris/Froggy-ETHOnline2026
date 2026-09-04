/**
 * The paid endpoint: our half of Hedera's requirement that somebody actually
 * *sell* something over x402.
 *
 * The challenge is a real 402 in both modes. That is deliberate: the shape of
 * the flow — the client gets a 402, builds a payment, retries with
 * `X-PAYMENT` — is the part worth exercising before any key exists, and a stub
 * that skipped straight to 200 would mean the payment path was never once run
 * before the demo.
 *
 * What the stub does *not* do is pretend money moved. Settlement returns a
 * visibly fake transaction id and `stubbed: true`, which travels onto the
 * receipt and into the UI.
 */

import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { Result, Schema } from "effect";

import { HBAR_ASSET, HEDERA_TESTNET, X402_VERSION } from "./types";
import type { OracleGate, PaidResource, SettleOutcome } from "./types";

const MAX_TIMEOUT_SECONDS = 120;

/** What we send the facilitator: the x402 verify/settle request body. */
interface FacilitatorRequest {
  readonly paymentPayload: PaymentEnvelope;
  readonly paymentRequirements: PaymentRequirements;
  readonly x402Version: number;
}

/**
 * What comes back.
 *
 * Every field is optional because `/verify` and `/settle` answer with different
 * subsets, and decoded rather than asserted because this is a third party
 * telling us whether money moved — the one answer in the system most worth
 * refusing to guess at.
 */
const FacilitatorResponse = Schema.Struct({
  errorMessage: Schema.optional(Schema.String),
  errorReason: Schema.optional(Schema.String),
  invalidMessage: Schema.optional(Schema.String),
  invalidReason: Schema.optional(Schema.String),
  isValid: Schema.optional(Schema.Boolean),
  success: Schema.optional(Schema.Boolean),
  transaction: Schema.optional(Schema.String),
});

type FacilitatorResponse = typeof FacilitatorResponse.Type;

const decodeFacilitatorResponse =
  Schema.decodeUnknownResult(FacilitatorResponse);

const requirementsFor = (
  payTo: string,
  resource: PaidResource
): PaymentRequirements => ({
  amount: resource.units,
  asset: HBAR_ASSET,
  extra: {},
  maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
  network: HEDERA_TESTNET,
  payTo,
  scheme: "exact",
});

const challengeFor = (
  payTo: string,
  resource: PaidResource
): PaymentRequired => ({
  accepts: [requirementsFor(payTo, resource)],
  error: "Payment required.",
  resource: {
    description: resource.description,
    mimeType: "application/json",
    serviceName: "Froggy lending oracle",
    tags: ["defi", "lending", "the-graph"],
    url: resource.url,
  },
  x402Version: X402_VERSION,
});

/**
 * The `X-PAYMENT` envelope, checked at the boundary.
 *
 * Only the envelope. Whether the signature is valid and whether the payer holds
 * the funds are the facilitator's to decide, because it is the only party that
 * can actually check — duplicating that here would produce two implementations
 * of one rule, and this copy would be the one that drifts.
 */
const PaymentEnvelope = Schema.Struct({
  accepted: Schema.Unknown,
  payload: Schema.Unknown,
  x402Version: Schema.Finite,
});

type PaymentEnvelope = typeof PaymentEnvelope.Type;

const decodeEnvelope = Schema.decodeUnknownResult(
  Schema.fromJsonString(PaymentEnvelope)
);

const decodeHeader = (paymentHeader: string): PaymentEnvelope | null => {
  const decoded = decodeEnvelope(
    Buffer.from(paymentHeader, "base64").toString("utf-8")
  );
  if (Result.isFailure(decoded)) {
    return null;
  }
  return decoded.success;
};

export interface LiveOracleOptions {
  /** Blocky402. Testnet: https://api.testnet.blocky402.com */
  readonly facilitatorUrl: string;
  readonly payTo: string;
}

/**
 * Live settlement, through the facilitator.
 *
 * Two calls, in this order and never merged: `/verify` decides whether the
 * payment is well-formed and funded, `/settle` submits it. Skipping verify and
 * relying on settle to fail would mean a malformed payment costs a chain round
 * trip and returns an error the caller cannot distinguish from a real failure.
 */
export const liveOracleGate = (options: LiveOracleOptions): OracleGate => {
  /**
   * One call to the facilitator.
   *
   * Returns `unknown` narrowed by the caller rather than a parsed type: the
   * two response shapes are different, each caller reads exactly the fields it
   * needs, and inventing a union here would be a third definition of a protocol
   * that already has two.
   */
  const post = async (
    path: string,
    body: FacilitatorRequest
  ): Promise<FacilitatorResponse> => {
    const response = await fetch(`${options.facilitatorUrl}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Facilitator ${path} returned ${response.status} ${response.statusText}`
      );
    }
    // SAFETY: the facilitator speaks the x402 verify/settle contract, and
    // `FacilitatorResponse` marks every field optional precisely because the
    // two endpoints answer with different subsets. Each caller checks the flag
    // it depends on before reading anything else.
    const decoded = decodeFacilitatorResponse(await response.json());
    if (Result.isFailure(decoded)) {
      throw new Error(`Facilitator ${path} returned an unrecognised body.`);
    }
    return decoded.success;
  };

  return {
    challenge: (resource) => challengeFor(options.payTo, resource),
    mode: "live",
    payTo: options.payTo,
    settle: async (paymentHeader, requirements) => {
      const paymentPayload = decodeHeader(paymentHeader);
      if (paymentPayload === null) {
        return {
          error: "X-PAYMENT was not base64-encoded JSON.",
          ok: false,
          stubbed: false,
          transactionId: null,
        } satisfies SettleOutcome;
      }
      const request = {
        paymentPayload,
        paymentRequirements: requirements,
        x402Version: X402_VERSION,
      };
      const verified = await post("/verify", request);
      if (verified.isValid !== true) {
        return {
          error:
            verified.invalidMessage ??
            verified.invalidReason ??
            "Payment rejected.",
          ok: false,
          stubbed: false,
          transactionId: null,
        } satisfies SettleOutcome;
      }
      const settled = await post("/settle", request);
      if (settled.success !== true) {
        return {
          error:
            settled.errorMessage ?? settled.errorReason ?? "Settlement failed.",
          ok: false,
          stubbed: false,
          transactionId: null,
        } satisfies SettleOutcome;
      }
      return {
        ok: true,
        stubbed: false,
        transactionId: settled.transaction ?? null,
      } satisfies SettleOutcome;
    },
  };
};

/** The placeholder `payTo` while no Hedera account exists. Obviously not real. */
export const STUB_PAY_TO = "0.0.0";

export const stubOracleGate = (): OracleGate => ({
  challenge: (resource) => challengeFor(STUB_PAY_TO, resource),
  mode: "stub",
  payTo: STUB_PAY_TO,
  settle: async (paymentHeader) => {
    await Promise.resolve();
    // Still requires a syntactically valid header. Accepting anything at all
    // would mean the client's payload construction was never exercised, and
    // that is the half most likely to be wrong when a real key arrives.
    if (decodeHeader(paymentHeader) === null) {
      return {
        error: "X-PAYMENT was not base64-encoded JSON.",
        ok: false,
        stubbed: true,
        transactionId: null,
      } satisfies SettleOutcome;
    }
    return {
      ok: true,
      stubbed: true,
      transactionId: `stub-not-a-real-hedera-transaction-${Date.now()}`,
    } satisfies SettleOutcome;
  },
});
