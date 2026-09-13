/**
 * The client half of the x402 "exact" scheme on an EVM network, as pure data.
 *
 * The browser signs the EIP-3009 `TransferWithAuthorization` with the person's
 * own wallet and hands the server an x402 payment header; the server verifies
 * and settles it. Everything here is deterministic given its inputs, so the
 * caller supplies the nonce and the validity window and the tests can pin the
 * exact bytes the server's verifier expects.
 */
import { Schema } from "effect";

/** A v2 x402 challenge as the server returns it with a 402. */
export const X402Challenge = Schema.Struct({
  x402Version: Schema.Int,
  resource: Schema.optional(
    Schema.Struct({
      url: Schema.String,
      description: Schema.optional(Schema.String),
      mimeType: Schema.optional(Schema.String),
    })
  ),
  accepts: Schema.Array(
    Schema.Struct({
      scheme: Schema.String,
      network: Schema.String,
      amount: Schema.String,
      asset: Schema.String,
      payTo: Schema.String,
      maxTimeoutSeconds: Schema.optional(Schema.Int),
      extra: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    })
  ),
});
export type X402Challenge = typeof X402Challenge.Type;

const evmAddress = Schema.String.check(Schema.isPattern(/^0x[\da-f]{40}$/iu));

/** One offer narrowed to what an EIP-3009 signer needs; the same bounds the server's payer applies. */
const ExactEvmAccept = Schema.Struct({
  scheme: Schema.Literal("exact"),
  network: Schema.String.check(Schema.isPattern(/^eip155:\d{1,10}$/u)),
  asset: evmAddress,
  payTo: evmAddress,
  amount: Schema.String.check(Schema.isPattern(/^[1-9]\d{0,77}$/u)),
  maxTimeoutSeconds: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 3600 })
  ),
  extra: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    assetTransferMethod: Schema.optional(Schema.Literal("eip3009")),
  }),
});
export type ExactEvmAccept = typeof ExactEvmAccept.Type;

const decodeAccept = Schema.decodeUnknownResult(ExactEvmAccept);

/** The first exact-scheme offer on `network` that carries an EIP-712 domain, or null. */
export const selectExactEvmAccept = (
  challenge: X402Challenge,
  network: string
): ExactEvmAccept | null => {
  for (const offer of challenge.accepts) {
    if (offer.network !== network) {
      continue;
    }
    const decoded = decodeAccept(offer);
    if (decoded._tag === "Success") {
      return decoded.success;
    }
  }
  return null;
};

const evmChainId = (network: string): number => {
  const [, id] = network.split(":");
  const chainId = Number(id);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`Not an EVM network: ${network}`);
  }
  return chainId;
};

export interface Eip3009Authorization {
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly validAfter: string;
  readonly validBefore: string;
  readonly nonce: string;
}

const EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

const TRANSFER_WITH_AUTHORIZATION = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

export interface ExactEvmTypedData {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
    readonly verifyingContract: string;
  };
  readonly types: {
    readonly EIP712Domain: typeof EIP712_DOMAIN;
    readonly TransferWithAuthorization: typeof TRANSFER_WITH_AUTHORIZATION;
  };
  readonly primaryType: "TransferWithAuthorization";
  readonly message: Eip3009Authorization;
}

/**
 * The document the person signs. `EIP712Domain` is listed because the wallet
 * RPC (`eth_signTypedData_v4`) wants it; verifiers derive the same domain type
 * from the domain fields, so the hash is the one the x402 facilitator checks.
 */
export const exactEvmTypedData = (input: {
  readonly accept: ExactEvmAccept;
  readonly from: string;
  readonly nonce: string;
  /** Unix seconds. Authorizations are valid from the epoch; only the end is bounded. */
  readonly validBefore: number;
}): ExactEvmTypedData => ({
  domain: {
    name: input.accept.extra.name,
    version: input.accept.extra.version,
    chainId: evmChainId(input.accept.network),
    verifyingContract: input.accept.asset,
  },
  types: {
    EIP712Domain: EIP712_DOMAIN,
    TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION,
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: input.from,
    to: input.accept.payTo,
    value: input.accept.amount,
    validAfter: "0",
    validBefore: String(input.validBefore),
    nonce: input.nonce,
  },
});

/** A `bytes32` nonce from 32 random bytes; anything else is a caller bug, not a wallet's. */
export const nonceHex = (bytes: Uint8Array): string => {
  if (bytes.length !== 32) {
    throw new Error(
      `An authorization nonce needs 32 bytes, not ${bytes.length}.`
    );
  }
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
};

const base64Utf8 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

interface ExactPaymentEnvelope {
  readonly x402Version: 2;
  readonly resource?: X402Challenge["resource"];
  readonly accepted: ExactEvmAccept;
  readonly payload: {
    readonly authorization: Eip3009Authorization;
    readonly signature: string;
  };
}

/** The `payment-signature` header: the accepted offer, the authorization, and its signature. */
export const encodeExactPaymentHeader = (input: {
  readonly accept: ExactEvmAccept;
  readonly resource: X402Challenge["resource"];
  readonly authorization: Eip3009Authorization;
  readonly signature: string;
}): string => {
  const payload = {
    authorization: input.authorization,
    signature: input.signature,
  };
  const envelope: ExactPaymentEnvelope =
    input.resource === undefined
      ? { x402Version: 2, accepted: input.accept, payload }
      : {
          x402Version: 2,
          resource: input.resource,
          accepted: input.accept,
          payload,
        };
  return base64Utf8(JSON.stringify(envelope));
};
