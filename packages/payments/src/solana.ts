/** Exact Solana payments use a facilitator fee payer and a partial signature. */
import {
  address,
  createSolanaRpc,
  getAddressEncoder,
  getProgramDerivedAddress,
  isAddress,
  signature,
} from "@solana/kit";
import type { TransactionPartialSigner } from "@solana/kit";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { MAX_MEMO_BYTES } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { Schema } from "effect";

import { X402_VERSION } from "./types";
import type { PaymentAttempt, PaymentChallenge, Payer } from "./types";

export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export type SolanaNetwork = typeof SOLANA_MAINNET | typeof SOLANA_DEVNET;

export const isSolanaNetwork = (value: string): value is SolanaNetwork =>
  value === SOLANA_MAINNET || value === SOLANA_DEVNET;

const MAX_U64 = 18_446_744_073_709_551_615n;
const SolanaAddress = Schema.String.pipe(
  Schema.check(Schema.makeFilter(isAddress))
);
const Requirement = Schema.Struct({
  amount: Schema.String.pipe(
    Schema.check(Schema.isPattern(/^[1-9]\d{0,19}$/u))
  ),
  asset: SolanaAddress,
  extra: Schema.Struct({
    feePayer: SolanaAddress,
    memo: Schema.optional(Schema.String),
  }),
  maxTimeoutSeconds: Schema.optional(
    Schema.Int.pipe(
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 3600 }))
    )
  ),
  network: Schema.Literals([SOLANA_MAINNET, SOLANA_DEVNET]),
  payTo: SolanaAddress,
  scheme: Schema.Literal("exact"),
});
const decodeRequirement = Schema.decodeUnknownResult(Requirement);

export interface SolanaPayerOptions {
  readonly network: SolanaNetwork;
  /** Configured by the server, never taken from a seller's challenge. */
  readonly rpcUrl?: string;
  readonly signer: TransactionPartialSigner;
}

const refuse = (error: string): PaymentAttempt => ({
  error,
  header: null,
  requirements: null,
  stubbed: false,
});

export const solanaPayer = (options: SolanaPayerOptions): Payer => ({
  accountId: options.signer.address,
  mode: "live",
  network: options.network,
  pay: async (challenge: PaymentChallenge) => {
    if (challenge.x402Version !== X402_VERSION) {
      return refuse("Solana payments require an x402 version 2 challenge.");
    }
    const match = challenge.accepts.find(
      (entry) => entry.network === options.network && entry.scheme === "exact"
    );
    const parsed = decodeRequirement(match);
    if (parsed._tag === "Failure" || match === undefined) {
      return refuse(
        "The Solana offer needs exact terms, valid addresses, a facilitator fee payer, and a positive amount."
      );
    }
    if (BigInt(parsed.success.amount) > MAX_U64) {
      return refuse(
        "The Solana amount exceeds an unsigned 64-bit token amount."
      );
    }
    if (parsed.success.extra.feePayer === options.signer.address) {
      return refuse("The buyer cannot be the Solana facilitator fee payer.");
    }
    if (
      parsed.success.extra.memo !== undefined &&
      new TextEncoder().encode(parsed.success.extra.memo).byteLength >
        MAX_MEMO_BYTES
    ) {
      return refuse(`The Solana payment memo exceeds ${MAX_MEMO_BYTES} bytes.`);
    }
    const requirements: PaymentRequirements = {
      amount: match.amount,
      asset: match.asset,
      extra: match.extra ?? {},
      maxTimeoutSeconds: match.maxTimeoutSeconds ?? 300,
      network: options.network,
      payTo: match.payTo,
      scheme: "exact",
    };
    const scheme = new ExactSvmScheme(
      options.signer,
      options.rpcUrl === undefined ? undefined : { rpcUrl: options.rpcUrl }
    );
    const signed = await scheme.createPaymentPayload(
      X402_VERSION,
      requirements
    );
    const payload: PaymentPayload = {
      accepted: requirements,
      payload: signed.payload,
      x402Version: signed.x402Version,
    };
    return {
      header: Buffer.from(JSON.stringify(payload), "utf-8").toString("base64"),
      requirements,
      stubbed: false,
    } satisfies PaymentAttempt;
  },
});

const SOLANA_RPC_URLS: Record<SolanaNetwork, string> = {
  [SOLANA_MAINNET]: "https://api.mainnet-beta.solana.com",
  [SOLANA_DEVNET]: "https://api.devnet.solana.com",
};

/** Circle mint registry checked 2026-09-08; amounts are USDC base units. */
const USDC_MINTS: Record<SolanaNetwork, string> = {
  [SOLANA_MAINNET]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  [SOLANA_DEVNET]: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

interface SolanaRpcOptions {
  readonly network: SolanaNetwork;
  readonly rpcUrl?: string;
}

export const solanaBalance = async (
  options: SolanaRpcOptions & { readonly address: string }
): Promise<bigint | null> => {
  try {
    const rpc = createSolanaRpc(
      options.rpcUrl ?? SOLANA_RPC_URLS[options.network]
    );
    const accounts = await rpc
      .getTokenAccountsByOwner(
        address(options.address),
        {
          mint: address(USDC_MINTS[options.network]),
        },
        { encoding: "jsonParsed", commitment: "confirmed" }
      )
      .send({ abortSignal: AbortSignal.timeout(10_000) });
    // The exact SDK spends from the canonical ATA, not arbitrary token accounts.
    // Program addresses match the installed @solana-program/token-2022 SDK.
    const encoder = getAddressEncoder();
    const [associated] = await getProgramDerivedAddress({
      programAddress: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
      seeds: [
        encoder.encode(address(options.address)),
        encoder.encode(address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
        encoder.encode(address(USDC_MINTS[options.network])),
      ],
    });
    const account = accounts.value.find((entry) => entry.pubkey === associated);
    if (account === undefined) {
      return 0n;
    }
    const { info } = account.account.data.parsed;
    if (
      info.state !== "initialized" ||
      info.owner !== options.address ||
      info.mint !== USDC_MINTS[options.network] ||
      info.tokenAmount.decimals !== 6
    ) {
      return 0n;
    }
    const units = BigInt(info.tokenAmount.amount);
    return units >= 0n ? units : null;
  } catch {
    return null;
  }
};

/** A status lookup cannot prove that a transaction matched the approved purchase. */
export const reconcileSolanaPayment = async (
  options: SolanaRpcOptions & { readonly transactionId: string }
): Promise<"success" | "failed" | "unknown"> => {
  try {
    const rpc = createSolanaRpc(
      options.rpcUrl ?? SOLANA_RPC_URLS[options.network]
    );
    const result = await rpc
      .getSignatureStatuses([signature(options.transactionId)], {
        searchTransactionHistory: true,
      })
      .send({ abortSignal: AbortSignal.timeout(10_000) });
    const [status] = result.value;
    if (
      status === null ||
      status === undefined ||
      (status.confirmationStatus !== "confirmed" &&
        status.confirmationStatus !== "finalized")
    ) {
      return "unknown";
    }
    return status.err === null ? "success" : "failed";
  } catch {
    return "unknown";
  }
};
