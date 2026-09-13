import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { authorizationTypes, eip3009ABI } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { Schema } from "effect";
import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  isHex,
  keccak256,
  parseEventLogs,
  parseAbi,
} from "viem";
import type { Abi, Hex } from "viem";

import { EVM_CHAIN_IDS } from "./evm";
import type { EvmNetwork } from "./evm";
import type { PaymentChallenge } from "./types";

const Address = Schema.String.check(Schema.isPattern(/^0x[\da-f]{40}$/iu));
const Uint = Schema.String.check(Schema.isPattern(/^\d{1,78}$/u));
const Authorization = Schema.Struct({
  from: Address,
  to: Address,
  value: Uint,
  validAfter: Uint,
  validBefore: Uint,
  nonce: Schema.String.check(Schema.isPattern(/^0x[\da-f]{64}$/iu)),
});
const Envelope = Schema.Struct({
  x402Version: Schema.Literal(2),
  accepted: Schema.Struct({
    scheme: Schema.Literal("exact"),
    network: Schema.Literals(["eip155:8453", "eip155:84532"]),
    asset: Address,
    payTo: Address,
    amount: Uint,
  }),
  payload: Schema.Struct({
    signature: Schema.String.check(
      Schema.isPattern(/^0x[\da-f]+$/iu),
      Schema.isMaxLength(16_386)
    ),
    authorization: Authorization,
  }),
});

const creditReadAbi: Abi = [
  ...eip3009ABI,
  ...parseAbi([
    "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  ]),
];
const creditWriteAbi: Abi = eip3009ABI;
const decodeEnvelope = Schema.decodeUnknownSync(
  Schema.fromJsonString(Envelope)
);
export const creditEvmPayer = (header: string): string =>
  decodeEnvelope(Buffer.from(header, "base64").toString("utf-8")).payload
    .authorization.from;

const matchingTerms = (
  envelope: typeof Envelope.Type,
  offer: PaymentChallenge["accepts"][number] | undefined,
  options: CreditEvmOptions,
  payer: string
): boolean => {
  if (offer === undefined) {
    return false;
  }
  const {
    accepted,
    payload: { authorization: auth },
  } = envelope;
  return (
    accepted.network === options.network &&
    offer.network === options.network &&
    offer.scheme === "exact" &&
    accepted.amount === offer.amount &&
    accepted.asset.toLowerCase() === options.token.toLowerCase() &&
    offer.asset.toLowerCase() === options.token.toLowerCase() &&
    accepted.payTo.toLowerCase() === options.payTo.toLowerCase() &&
    offer.payTo.toLowerCase() === options.payTo.toLowerCase() &&
    auth.from.toLowerCase() === payer.toLowerCase() &&
    auth.to.toLowerCase() === options.payTo.toLowerCase() &&
    auth.value === offer.amount
  );
};

const hex = (value: string): Hex => {
  if (!isHex(value)) {
    throw new Error("Expected hexadecimal transaction data.");
  }
  return value;
};
const address = (value: string): Hex => {
  if (!isAddress(value)) {
    throw new Error("Expected an EVM address.");
  }
  return value;
};

export interface CreditEvmSubmission {
  readonly transactionId: string;
  readonly signedTransaction: string;
  readonly transactionNonce: number;
}

export interface CreditSettlement {
  readonly status: "confirmed" | "failed" | "uncertain";
  readonly transactionId: string | null;
  readonly error: string | null;
}

export interface CreditEvmOptions {
  readonly network: EvmNetwork;
  readonly rpcUrl: string;
  readonly token: string;
  readonly payTo: string;
  readonly relayer: {
    readonly address: string;
    readonly signTransaction: (input: {
      readonly chainId: number;
      readonly data: string;
      readonly gasLimit: bigint;
      readonly maxFeePerGas: bigint;
      readonly maxPriorityFeePerGas: bigint;
      readonly nonce: number;
      readonly to: string;
      readonly value: bigint;
    }) => Promise<string>;
  };
}

/** Identity of the authorization, independent of signature encoding or request key. */
export const creditEvmAuthorization = (header: string): string => {
  const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(Envelope))(
    Buffer.from(header, "base64").toString("utf-8")
  );
  const { accepted, payload } = envelope;
  return [
    accepted.network,
    accepted.asset.toLowerCase(),
    payload.authorization.from.toLowerCase(),
    payload.authorization.nonce.toLowerCase(),
  ].join(":");
};

/** A private facilitator for Froggy's own USDC credit sales, never a public relay. */
export const evmCreditSettlement = (options: CreditEvmOptions) => {
  const client = createPublicClient({ transport: http(options.rpcUrl) });
  const token = address(options.token);
  const recipient = address(options.payTo);
  const relayer = address(options.relayer.address);

  const settle = async (input: {
    readonly header: string;
    readonly challenge: PaymentChallenge;
    readonly payer: string;
    readonly submission: CreditEvmSubmission | null;
    readonly beforeBroadcast: (
      submission: CreditEvmSubmission
    ) => Promise<void>;
  }): Promise<CreditSettlement> => {
    const envelope = Schema.decodeUnknownSync(Schema.fromJsonString(Envelope))(
      Buffer.from(input.header, "base64").toString("utf-8")
    );
    const [offer] = input.challenge.accepts;
    const { payload } = envelope;
    const { authorization: auth } = payload;
    if (
      offer === undefined ||
      !matchingTerms(envelope, offer, options, input.payer)
    ) {
      throw new Error(
        "Payment authorization does not match this credit purchase."
      );
    }
    const domain = Schema.decodeUnknownSync(
      Schema.Struct({ name: Schema.String, version: Schema.String })
    )(offer.extra);
    const message = {
      from: address(auth.from),
      to: recipient,
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: hex(auth.nonce),
    };
    let { submission } = input;
    const submitted = (): CreditEvmSubmission | null => submission;

    const reconcile = async (): Promise<CreditSettlement> => {
      if (submission === null) {
        throw new Error("No submitted credit payment to reconcile.");
      }
      try {
        const receipt = await client.getTransactionReceipt({
          hash: hex(submission.transactionId),
        });
        if (receipt.status !== "success") {
          return {
            status: "failed",
            transactionId: submission.transactionId,
            error: "The USDC settlement reverted. No credits were issued.",
          };
        }
        const transferred = parseEventLogs({
          abi: erc20Abi,
          eventName: "Transfer",
          logs: receipt.logs,
        }).some(
          (event) =>
            event.address.toLowerCase() === token.toLowerCase() &&
            event.args.from.toLowerCase() === auth.from.toLowerCase() &&
            event.args.to.toLowerCase() === recipient.toLowerCase() &&
            event.args.value === BigInt(auth.value)
        );
        return {
          status: transferred ? "confirmed" : "failed",
          transactionId: submission.transactionId,
          error: transferred
            ? null
            : "Settlement did not contain the quoted USDC transfer.",
        };
      } catch {
        return {
          status: "uncertain",
          transactionId: submission.transactionId,
          error:
            "USDC settlement confirmation is pending. This purchase will not be charged again.",
        };
      }
    };

    if (submission !== null) {
      // Recovery may resend only these exact signed bytes, never a new authorization.
      const result = await reconcile();
      if (result.status === "uncertain") {
        await client
          .sendRawTransaction({
            serializedTransaction: hex(submission.signedTransaction),
          })
          .catch(() => null);
      }
      return result;
    }

    const requirements: PaymentRequirements = {
      amount: offer.amount,
      asset: token,
      network: options.network,
      payTo: recipient,
      scheme: "exact",
      maxTimeoutSeconds: offer.maxTimeoutSeconds ?? 120,
      extra: { ...domain, assetTransferMethod: "eip3009" },
    };
    const payment: PaymentPayload = {
      x402Version: 2,
      accepted: requirements,
      payload: { authorization: auth, signature: payload.signature },
    };
    const scheme = new ExactEvmScheme(
      {
        getAddresses: () => [relayer],
        getCode: async (args) => await client.getCode(args),
        readContract: async (args) =>
          await client.readContract({
            ...args,
            abi: creditReadAbi,
          }),
        verifyTypedData: async (args) =>
          await client.verifyTypedData({
            address: args.address,
            signature: args.signature,
            domain: {
              ...domain,
              chainId: EVM_CHAIN_IDS[options.network],
              verifyingContract: token,
            },
            types: authorizationTypes,
            primaryType: "TransferWithAuthorization",
            message,
          }),
        sendTransaction: async () => {
          await Promise.resolve();
          throw new Error(
            "Credit funding does not deploy wallets or relay arbitrary transactions."
          );
        },
        writeContract: async (args) => {
          if (
            args.address.toLowerCase() !== token.toLowerCase() ||
            args.functionName !== "transferWithAuthorization" ||
            args.dataSuffix !== undefined ||
            String(args.args[0]).toLowerCase() !== auth.from.toLowerCase() ||
            String(args.args[1]).toLowerCase() !== recipient.toLowerCase() ||
            String(args.args[2]) !== auth.value ||
            String(args.args[3]) !== auth.validAfter ||
            String(args.args[4]) !== auth.validBefore ||
            String(args.args[5]).toLowerCase() !== auth.nonce.toLowerCase()
          ) {
            throw new Error(
              "The relayer can settle only this exact credit authorization."
            );
          }
          const [nonce, gasPrice] = await Promise.all([
            client.getTransactionCount({
              address: relayer,
              blockTag: "pending",
            }),
            client.getGasPrice(),
          ]);
          const data = encodeFunctionData({
            abi: creditWriteAbi,
            functionName: args.functionName,
            args: args.args,
          });
          const signedTransaction = await options.relayer.signTransaction({
            chainId: EVM_CHAIN_IDS[options.network],
            data,
            gasLimit: 300_000n,
            maxFeePerGas: gasPrice * 2n + 1_000_000n,
            maxPriorityFeePerGas: 1_000_000n,
            nonce,
            to: token,
            value: 0n,
          });
          const transactionId = keccak256(hex(signedTransaction));
          const next = {
            transactionId,
            signedTransaction,
            transactionNonce: nonce,
          };
          await input.beforeBroadcast(next);
          submission = next;
          await client.sendRawTransaction({
            serializedTransaction: hex(signedTransaction),
          });
          return transactionId;
        },
        waitForTransactionReceipt: async ({ hash }) =>
          await client.waitForTransactionReceipt({ hash, timeout: 25_000 }),
      },
      {
        eip6492AllowedFactories: [],
        simulateInSettle: true,
        // The authoritative store is written before broadcast. The SDK's own
        // delete-on-read cache must never erase that durable transaction identity.
        pendingSettlementStore: {
          get: async () => await Promise.resolve(submission?.transactionId),
          set: async (_key, transactionId) => {
            if (submission?.transactionId !== transactionId) {
              throw new Error("Settlement has no durable transaction record.");
            }
            await Promise.resolve();
          },
          delete: async () => {
            await Promise.resolve();
          },
        },
      }
    );
    try {
      const verified = await scheme.verify(payment, requirements);
      if (!verified.isValid) {
        return {
          status: "failed",
          transactionId: null,
          error: verified.invalidReason ?? "USDC payment verification failed.",
        };
      }
      const settled = await scheme.settle(payment, requirements);
      if (submission !== null) {
        return await reconcile();
      }
      return {
        status: "failed",
        transactionId: null,
        error:
          settled.errorReason ??
          "The treasury did not submit the USDC payment.",
      };
    } catch (error) {
      return {
        status: submission === null ? "failed" : "uncertain",
        transactionId: submitted()?.transactionId ?? null,
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "USDC settlement failed.",
      };
    }
  };
  return { settle };
};

export type EvmCreditSettlement = ReturnType<typeof evmCreditSettlement>;
