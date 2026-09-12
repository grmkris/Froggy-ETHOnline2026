/**
 * Paying an EVM x402 challenge with a signature that somebody else holds.
 *
 * The exact scheme on an EVM chain is an EIP-3009 `TransferWithAuthorization`:
 * the buyer signs typed data saying "the facilitator may move this much USDC
 * from me to the seller before this time", and the facilitator submits it.
 * The buyer never holds gas and never sends a transaction — it signs.
 *
 * Which is why the signer is a port and not a key. The signature comes from
 * Privy, under a policy that names the payee and the ceiling, and a request
 * outside that policy is refused *by Privy*, with the policy's id, before any
 * payload exists. That refusal is the leash working, and it is reported as
 * such rather than as a network error.
 */

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm";
import { Schema } from "effect";

import { challengeResource, X402_VERSION } from "./types";
import type { PaymentAttempt, PaymentChallenge, Payer } from "./types";

const DEFAULT_TIMEOUT_SECONDS = 300;
const MAX_TIMEOUT_SECONDS = 3600;
const MAX_UINT256 = 2n ** 256n - 1n;

export type EvmNetwork = "eip155:8453" | "eip155:84532";

export const EVM_CHAIN_IDS: Record<EvmNetwork, number> = {
  "eip155:8453": 8453,
  "eip155:84532": 84_532,
};

/** Plain words for a receipt or a tool's answer. */
export const EVM_NETWORK_LABELS: Record<EvmNetwork, string> = {
  "eip155:8453": "Base",
  "eip155:84532": "Base Sepolia",
};

export const isEvmNetwork = (value: string): value is EvmNetwork =>
  value === "eip155:8453" || value === "eip155:84532";

/** A `0x` address, checked once at the boundary rather than trusted. */
const isHexAddress = (value: string): value is `0x${string}` =>
  /^0x[\da-f]{40}$/iu.test(value);

const Eip3009Requirement = Schema.Struct({
  amount: Schema.String.check(Schema.isPattern(/^[1-9]\d{0,77}$/u)),
  asset: Schema.String.check(Schema.isPattern(/^0x[\da-f]{40}$/iu)),
  extra: Schema.Struct({
    assetTransferMethod: Schema.optional(Schema.Literal("eip3009")),
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
    version: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  }),
  maxTimeoutSeconds: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: MAX_TIMEOUT_SECONDS })
  ),
  payTo: Schema.String.check(Schema.isPattern(/^0x[\da-f]{40}$/iu)),
});
const isEip3009Requirement = Schema.is(Eip3009Requirement);

/** A value inside EIP-712 typed data. Bigints included: the scheme hands them over raw. */
export type TypedDataValue =
  | bigint
  | boolean
  | number
  | string
  | readonly TypedDataValue[]
  | { readonly [key: string]: TypedDataValue };

const TypedDataValueSchema: Schema.Codec<TypedDataValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.BigInt,
    Schema.Boolean,
    Schema.Number,
    Schema.String,
    Schema.Array(TypedDataValueSchema),
    Schema.Record(Schema.String, TypedDataValueSchema),
  ])
);

const TypedDataFieldSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
});
export type TypedDataField = typeof TypedDataFieldSchema.Type;

/** What a signer is asked to sign: the scheme's request, parsed at the boundary. */
const TypedDataSchema = Schema.Struct({
  domain: Schema.Record(Schema.String, TypedDataValueSchema),
  message: Schema.Record(Schema.String, TypedDataValueSchema),
  primaryType: Schema.Literal("TransferWithAuthorization"),
  types: Schema.Record(Schema.String, Schema.Array(TypedDataFieldSchema)),
});
export type TypedData = typeof TypedDataSchema.Type;

const decodeTypedData = Schema.decodeUnknownResult(TypedDataSchema);

/** A signature is `0x` and hex; checked, not asserted. */
const isHexSignature = Schema.is(
  Schema.TemplateLiteral(["0x", Schema.String]).check(
    Schema.isPattern(/^0x(?:[\da-f]{2})+$/iu)
  )
);

/**
 * Whoever can sign EIP-712 typed data for an address. Deliberately the
 * smallest surface: no transactions, no reads.
 */
export interface EvmTypedDataSigner {
  readonly address: string;
  readonly signTypedData: (typedData: TypedData) => Promise<string>;
}

/** The signer said no. Carried verbatim; it is the best evidence there is. */
export class SignerRefusedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "SignerRefusedError";
  }
}

const selectRequirements = (
  challenge: PaymentChallenge,
  network: EvmNetwork
): PaymentRequirements | null => {
  const match = challenge.accepts.find(
    (entry) => entry.network === network && entry.scheme === "exact"
  );
  if (match === undefined) {
    return null;
  }
  return {
    amount: match.amount,
    asset: match.asset,
    extra: match.extra ?? {},
    maxTimeoutSeconds: match.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    network,
    payTo: match.payTo,
    scheme: "exact",
  };
};

const encodeHeader = (payload: PaymentPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");

export interface EvmPayerOptions {
  readonly network: EvmNetwork;
  readonly signer: EvmTypedDataSigner;
}

export const evmPayer = (options: EvmPayerOptions): Payer => {
  const { signer } = options;
  const { address } = signer;
  if (!isHexAddress(address)) {
    throw new Error(`Not an EVM address: ${address}`);
  }
  const scheme = new ExactEvmScheme({
    address,
    signTypedData: async (message) => {
      const typedData = decodeTypedData(message);
      if (typedData._tag === "Failure") {
        throw new SignerRefusedError(
          "The scheme produced typed data this signer cannot read."
        );
      }
      const signature = await signer.signTypedData(typedData.success);
      if (!isHexSignature(signature)) {
        throw new SignerRefusedError("The signer returned no hex signature.");
      }
      return signature;
    },
  });

  return {
    accountId: address,
    mode: "live",
    network: options.network,
    pay: async (challenge) => {
      const requirements = selectRequirements(challenge, options.network);
      if (requirements === null) {
        return {
          error: `The 402 offered no ${options.network} exact requirement this wallet can pay.`,
          header: null,
          requirements: null,
          stubbed: false,
        } satisfies PaymentAttempt;
      }
      // The SDK also implements Permit2. Its capabilities do not widen the
      // spending authority this adapter exposes to the caller's signer.
      if (
        !isEip3009Requirement(requirements) ||
        BigInt(requirements.amount) > MAX_UINT256
      ) {
        return {
          error:
            "The offer must use EIP-3009, valid EVM addresses, a positive uint256 amount, an EIP-712 name and version, and a timeout of 1–3600 seconds.",
          header: null,
          requirements,
          stubbed: false,
        } satisfies PaymentAttempt;
      }
      const result = await scheme.createPaymentPayload(
        X402_VERSION,
        requirements
      );
      const payload: PaymentPayload = {
        accepted: requirements,
        payload: result.payload,
        x402Version: result.x402Version,
      };
      const resource = challengeResource(challenge);
      if (resource !== undefined) {
        payload.resource = resource;
      }
      if (result.extensions !== undefined) {
        payload.extensions = result.extensions;
      }
      return {
        header: encodeHeader(payload),
        requirements,
        stubbed: false,
      } satisfies PaymentAttempt;
    },
  };
};
