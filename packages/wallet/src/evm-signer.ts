/**
 * The agent's signature, from Privy, under the policy.
 *
 * `eth_signTypedData_v4` on the user's embedded wallet, authorized by the
 * agent's P-256 key — the additional signer the user granted, whose every
 * request Privy evaluates against the committed policy. A request the policy
 * does not allow comes back as a refusal from Privy naming the policy, and
 * that refusal is passed on as itself: it is the leash working, and the
 * receipt should say so in Privy's words.
 *
 * Privy speaks JSON. The x402 scheme hands over bigints, so every bigint in
 * the message becomes a decimal string on the way out.
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

export const privyTypedDataSigner = (
  client: PrivyClient,
  input: { readonly agent: AgentKey; readonly wallet: UserWallet }
): AgentTypedDataSigner => ({
  address: input.wallet.address,
  signTypedData: async (typedData) => {
    try {
      const signed = await client
        .wallets()
        .ethereum()
        .signTypedData(input.wallet.id, {
          // The agent key, and only the agent key: the user's token is not
          // here, so nothing this signs can exceed what the policy allows.
          authorization_context: {
            authorization_private_keys: [input.agent.privateKey],
          },
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
        throw new PrivySignerRefusedError(
          `Privy refused to sign: ${error.message}`
        );
      }
      throw error;
    }
  },
});
