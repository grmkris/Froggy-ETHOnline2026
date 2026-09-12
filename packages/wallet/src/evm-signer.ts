/**
 * The agent's signature, from Privy, under the policy.
 *
 * Two methods on the user's embedded wallet, both authorized by the agent's
 * P-256 key — the additional signer the user granted, whose every request
 * Privy evaluates against the committed policy:
 *
 *   - `eth_signTypedData_v4`, for the EIP-3009 authorization an EVM x402
 *     payment is made of.
 *   - `eth_signTransaction`, for an ERC-20 transfer the host then broadcasts.
 *     Signing rather than sending, because Privy keeps its rolling
 *     aggregations — the 24-hour cap on top-ups — for signing methods only.
 *
 * A request the policy does not allow comes back as a refusal from Privy
 * naming the policy, and that refusal is passed on as itself: it is the leash
 * working, and the receipt should say so in Privy's words.
 *
 * Privy speaks JSON. The x402 scheme hands over bigints, so every bigint in
 * the message becomes a decimal string on the way out; transaction quantities
 * go as hex.
 */

import { APIError } from "@privy-io/node";
import type { PrivyClient } from "@privy-io/node";
import { Schema } from "effect";

import type { AgentKey, UserWallet } from "./agent-signer";

/** A value inside EIP-712 typed data, as `packages/payments` defines it. */
type TypedDataValue =
  | bigint
  | boolean
  | number
  | string
  | readonly TypedDataValue[]
  | { readonly [key: string]: TypedDataValue };

interface TypedDataField {
  readonly name: string;
  readonly type: string;
}

/** The port `packages/payments` pays through. Structurally the same interface. */
export interface AgentTypedDataSigner {
  readonly address: string;
  readonly signTypedData: (typedData: {
    readonly domain: { readonly [key: string]: TypedDataValue };
    readonly message: { readonly [key: string]: TypedDataValue };
    readonly primaryType: string;
    readonly types: { readonly [name: string]: readonly TypedDataField[] };
  }) => Promise<string>;
}

/** Chosen by the verifier integration using a fresh read on the signature's chain. */
export type SignatureOptionsResolver = (
  address: string,
  typedData: Parameters<AgentTypedDataSigner["signTypedData"]>[0]
) => Promise<{ readonly type: "erc1271" } | null | undefined>;

/** A type-2 transaction, before Privy has signed it. Quantities as bigints. */
export interface UnsignedEvmTransaction {
  readonly chainId: number;
  readonly data: string;
  readonly gasLimit: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly nonce: number;
  readonly to: string;
  readonly value: bigint;
}

/** Every signature the agent can ask for, from one wallet under one policy. */
export interface AgentEvmSigner extends AgentTypedDataSigner {
  /**
   * EIP-191 `personal_sign` over raw bytes, for a dapp's sign-in or terms
   * message. Bytes rather than text, so a message that is not UTF-8 signs as
   * the page meant it; the policy's `message.content` condition still reads
   * the text form when there is one.
   */
  readonly signMessage: (message: Uint8Array) => Promise<string>;
  /** Returns the RLP-encoded signed transaction, ready to broadcast. */
  readonly signTransaction: (
    transaction: UnsignedEvmTransaction
  ) => Promise<string>;
}

/** Privy said no. The message is Privy's, verbatim. */
export class PrivySignerRefusedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "PrivySignerRefusedError";
  }
}

/** JSON has no bigint; Privy reads decimal strings. */
type JsonValue =
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const isBigInt = Schema.is(Schema.BigInt);
const isPrimitive = Schema.is(
  Schema.Union([Schema.Boolean, Schema.Number, Schema.String])
);

const jsonSafe = (value: TypedDataValue): JsonValue => {
  if (isBigInt(value)) {
    return value.toString();
  }
  if (isPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)])
  );
};

const jsonRecord = (source: { readonly [key: string]: TypedDataValue }) =>
  Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [key, jsonSafe(entry)])
  );

/** An EIP-712 domain is strings and numbers; anything else is not a domain. */
const isDomainValue = Schema.is(Schema.Union([Schema.Number, Schema.String]));

const domainOf = (source: { readonly [key: string]: TypedDataValue }) =>
  Object.fromEntries(
    Object.entries(source).flatMap(([key, entry]) => {
      const safe = jsonSafe(entry);
      return isDomainValue(safe) ? [[key, safe] as const] : [];
    })
  );

const typesOf = (source: {
  readonly [name: string]: readonly TypedDataField[];
}) =>
  Object.fromEntries(
    Object.entries(source).map(([name, fields]) => [
      name,
      fields.map((field) => ({ name: field.name, type: field.type })),
    ])
  );

const hex = (value: bigint): string => `0x${value.toString(16)}`;

const signingChainId = Schema.Union([
  Schema.Int,
  Schema.BigInt,
  Schema.String.check(Schema.isPattern(/^(?:[0-9]+|0x[0-9a-fA-F]+)$/u)),
]);

const signatureFields = async (
  address: string,
  typedData: Parameters<AgentTypedDataSigner["signTypedData"]>[0],
  resolve: SignatureOptionsResolver | undefined
) => {
  const options = await resolve?.(address, typedData);
  const chain = typedData.domain["chainId"];
  // EIP-712 permits chainless documents. Privy requires a chain whenever
  // signature_options is present, so keep its default for those documents.
  if (chain === undefined) {
    if (options !== null && options !== undefined) {
      throw new Error("Contract signature encoding requires a signing chain.");
    }
    return {};
  }
  const chainId = BigInt(Schema.decodeUnknownSync(signingChainId)(chain));
  if (chainId < 0n) {
    throw new Error("The signing chain ID cannot be negative.");
  }
  return {
    caip2: `eip155:${chainId}` as const,
    signature_options: options ?? { type: "ecdsa" as const },
  };
};

const isInvalidData = Schema.is(
  Schema.Struct({ code: Schema.Literal("invalid_data") })
);

const typedDataFailure = (
  error: { readonly error: unknown; readonly message: string },
  refusal: string
): Error =>
  isInvalidData(error.error)
    ? new Error(`Privy rejected the signing request: ${error.message}`)
    : new PrivySignerRefusedError(`${refusal}: ${error.message}`);

export const privyAgentSigner = (
  client: PrivyClient,
  input: {
    readonly agent: AgentKey;
    readonly wallet: UserWallet;
    readonly signatureOptionsFor?: SignatureOptionsResolver | undefined;
  }
): AgentEvmSigner => {
  // The agent key, and only the agent key: the user's token is not here, so
  // nothing this signs can exceed what the policy allows.
  const authorization_context = {
    authorization_private_keys: [input.agent.privateKey],
  };
  return {
    address: input.wallet.address,
    signMessage: async (message) => {
      try {
        const signed = await client
          .wallets()
          .ethereum()
          .signMessage(input.wallet.id, { authorization_context, message });
        return signed.signature;
      } catch (error) {
        if (error instanceof APIError) {
          throw new PrivySignerRefusedError(
            `Privy refused to sign under policy ${input.agent.policyId}: ${error.message}`
          );
        }
        throw error;
      }
    },
    signTransaction: async (transaction) => {
      try {
        const signed = await client
          .wallets()
          .ethereum()
          .signTransaction(input.wallet.id, {
            authorization_context,
            params: {
              transaction: {
                chain_id: transaction.chainId,
                data: transaction.data,
                gas_limit: hex(transaction.gasLimit),
                max_fee_per_gas: hex(transaction.maxFeePerGas),
                max_priority_fee_per_gas: hex(transaction.maxPriorityFeePerGas),
                nonce: transaction.nonce,
                to: transaction.to,
                type: 2,
                value: hex(transaction.value),
              },
            },
          });
        return signed.signed_transaction;
      } catch (error) {
        // Privy's refusal, in its words; anything else is rethrown as itself.
        if (error instanceof APIError) {
          throw new PrivySignerRefusedError(
            `Privy refused to sign under policy ${input.agent.policyId}: ${error.message}`
          );
        }
        throw error;
      }
    },
    signTypedData: async (typedData) => {
      try {
        const signed = await client
          .wallets()
          .ethereum()
          .signTypedData(input.wallet.id, {
            authorization_context,
            ...(await signatureFields(
              input.wallet.address,
              typedData,
              input.signatureOptionsFor
            )),
            params: {
              typed_data: {
                domain: domainOf(typedData.domain),
                message: jsonRecord(typedData.message),
                primary_type: typedData.primaryType,
                types: typesOf(typedData.types),
              },
            },
          });
        return signed.signature;
      } catch (error) {
        if (error instanceof APIError) {
          throw typedDataFailure(
            error,
            `Privy refused to sign under policy ${input.agent.policyId}`
          );
        }
        throw error;
      }
    },
  };
};

/** One human-approved payment; the coordinator binds the request before this is created. */
export const privyOwnerSigner = (
  client: PrivyClient,
  input: {
    readonly accessToken: string;
    readonly wallet: UserWallet;
    readonly signatureOptionsFor?: SignatureOptionsResolver | undefined;
  }
): AgentTypedDataSigner => {
  const { wallet } = input;
  let ownerToken: string | null = input.accessToken;
  return {
    address: wallet.address,
    signTypedData: async (typedData) => {
      if (ownerToken === null) {
        throw new PrivySignerRefusedError(
          "This owner signer has already been used."
        );
      }
      const accessToken = ownerToken;
      ownerToken = null;
      try {
        const signed = await client
          .wallets()
          .ethereum()
          .signTypedData(wallet.id, {
            authorization_context: { user_jwts: [accessToken] },
            ...(await signatureFields(
              input.wallet.address,
              typedData,
              input.signatureOptionsFor
            )),
            params: {
              typed_data: {
                domain: domainOf(typedData.domain),
                message: jsonRecord(typedData.message),
                primary_type: typedData.primaryType,
                types: typesOf(typedData.types),
              },
            },
          });
        return signed.signature;
      } catch (error) {
        if (error instanceof APIError) {
          throw typedDataFailure(error, "Privy refused the owner's payment");
        }
        throw error;
      }
    },
  };
};

/** Created after an exact human trade approval; consumed before contacting Privy. */
export const privyOwnerTransactionSigner = (
  client: PrivyClient,
  input: { readonly accessToken: string; readonly wallet: UserWallet }
): Pick<AgentEvmSigner, "address" | "signTransaction"> => {
  let token: string | null = input.accessToken;
  return {
    address: input.wallet.address,
    signTransaction: async (transaction) => {
      if (token === null) {
        throw new PrivySignerRefusedError(
          "This owner trade signer has already been used."
        );
      }
      const accessToken = token;
      token = null;
      try {
        const result = await client
          .wallets()
          .ethereum()
          .signTransaction(input.wallet.id, {
            authorization_context: { user_jwts: [accessToken] },
            params: {
              transaction: {
                chain_id: transaction.chainId,
                data: transaction.data,
                gas_limit: hex(transaction.gasLimit),
                max_fee_per_gas: hex(transaction.maxFeePerGas),
                max_priority_fee_per_gas: hex(transaction.maxPriorityFeePerGas),
                nonce: transaction.nonce,
                to: transaction.to,
                type: 2,
                value: hex(transaction.value),
              },
            },
          });
        return result.signed_transaction;
      } catch {
        // SDK errors may echo authorization or transaction details.
        throw new PrivySignerRefusedError(
          "Privy did not return the owner's signed trade transaction."
        );
      }
    },
  };
};
