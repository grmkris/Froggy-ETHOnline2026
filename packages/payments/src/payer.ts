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

import { PublicKey } from "@hiero-ledger/sdk";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  AccountId,
  createHederaClient,
  ExactHederaScheme,
  Hbar,
  PrivateKey,
  TokenId,
  TransactionId,
  TransferTransaction,
} from "@x402/hedera";
import type { ClientHederaSigner } from "@x402/hedera";
import { Schema } from "effect";

import { HEDERA_TESTNET, X402_VERSION } from "./types";
import type {
  HederaNetwork,
  PaymentAttempt,
  PaymentChallenge,
  Payer,
} from "./types";

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
  challenge: PaymentChallenge,
  network: HederaNetwork
): PaymentRequirements | null => {
  const match = challenge.accepts.find(
    (entry) => entry.network === network && entry.scheme === "exact"
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
    network,
    payTo: match.payTo,
    scheme: "exact",
  };
};

/** The one field of `extra` the Hedera scheme needs: who pays the network fee. */
const FeePayer = Schema.Struct({ feePayer: Schema.String });
const decodeFeePayer = Schema.decodeUnknownResult(FeePayer);

const encodeHeader = (payload: PaymentPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");

export interface LivePayerOptions {
  readonly accountId: string;
  /** Which Hedera this account lives on. The 402 must offer the same one. */
  readonly network: HederaNetwork;
  /** Hedera ECDSA key, `0x`-prefixed. Never reaches the model or the browser. */
  readonly privateKey: string;
}

const payerFromSigner = (
  signer: ClientHederaSigner,
  network: HederaNetwork
): Payer => {
  const scheme = new ExactHederaScheme(signer);

  return {
    accountId: signer.accountId,
    mode: "live",
    network,
    pay: async (challenge) => {
      const requirements = selectRequirements(challenge, network);
      if (requirements === null) {
        return {
          error: `The 402 offered no ${network} \`exact\` requirement we can pay.`,
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

export interface SignerPayerOptions {
  readonly accountId: string;
  readonly network: HederaNetwork;
  /** The account's ECDSA public key, compressed hex, as Privy states it. */
  readonly publicKey: string;
  /**
   * Signs the transaction body bytes with the account's key and returns the
   * 64-byte compact signature. Whoever holds the key hashes with keccak256.
   */
  readonly signBytes: (bytes: Uint8Array) => Promise<Uint8Array>;
}

/**
 * A payer whose key lives elsewhere: Privy's `raw_sign`, a hardware key,
 * anything that can sign body bytes on request. The transfer is built the
 * way `@x402/hedera`'s own client signer builds it (the fee payer's
 * transaction id, so the facilitator pays the fee), then signed through the
 * callback instead of a private key.
 */
export const signerHederaPayer = (options: SignerPayerOptions): Payer => {
  const account = AccountId.fromString(options.accountId);
  const publicKey = PublicKey.fromStringECDSA(options.publicKey);
  const signer: ClientHederaSigner = {
    accountId: account.toString(),
    createPartiallySignedTransferTransaction: async (requirements) => {
      const extra = decodeFeePayer(requirements.extra);
      if (extra._tag === "Failure") {
        throw new Error("feePayer is required in paymentRequirements.extra");
      }
      const { feePayer } = extra.success;
      const amount = BigInt(requirements.amount);
      if (amount <= 0n) {
        throw new Error("amount must be greater than zero");
      }
      const payTo = AccountId.fromString(requirements.payTo);
      const transaction = new TransferTransaction();
      if (requirements.asset === "0.0.0") {
        transaction.addHbarTransfer(
          account,
          Hbar.fromTinybars((-amount).toString())
        );
        transaction.addHbarTransfer(
          payTo,
          Hbar.fromTinybars(amount.toString())
        );
      } else {
        const token = TokenId.fromString(requirements.asset);
        transaction.addTokenTransfer(token, account, Number(-amount));
        transaction.addTokenTransfer(token, payTo, Number(amount));
      }
      transaction.setTransactionId(
        TransactionId.generate(AccountId.fromString(feePayer))
      );
      // Mainnet's default signs for many nodes. Duplicated x402 headers then
      // exceed the hosted HTTP header limit before reaching our handler.
      // Three SDK-selected nodes retain failover while bounding the proof.
      const client = createHederaClient(
        options.network
      ).setMaxNodesPerTransaction(3);
      try {
        transaction.freezeWith(client);
        await transaction.signWith(publicKey, options.signBytes);
        return Buffer.from(transaction.toBytes()).toString("base64");
      } finally {
        client.close();
      }
    },
  };
  return payerFromSigner(signer, options.network);
};

export const liveHederaPayer = (options: LivePayerOptions): Payer => {
  const key = PrivateKey.fromStringECDSA(options.privateKey);
  return signerHederaPayer({
    accountId: options.accountId,
    network: options.network,
    publicKey: key.publicKey.toStringRaw(),
    signBytes: async (bytes) => await Promise.resolve(key.sign(bytes)),
  });
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
    const requirements = selectRequirements(challenge, HEDERA_TESTNET);
    if (requirements === null) {
      return {
        error:
          "The 402 offered no Hedera testnet `exact` requirement we can pay.",
        header: null,
        requirements: null,
        stubbed: true,
      } satisfies PaymentAttempt;
    }
    // A nonce, so two stub payments are two proofs rather than one replayed:
    // the seller's book keys on the header, and a keyless demo that bought
    // twice must be seen to have bought twice.
    const payload: PaymentPayload = {
      accepted: requirements,
      payload: {
        transaction: `stub-unsigned-no-hedera-key-configured-${Date.now()}-${crypto.randomUUID()}`,
      },
      x402Version: X402_VERSION,
    };
    return {
      header: encodeHeader(payload),
      requirements,
      stubbed: true,
    } satisfies PaymentAttempt;
  },
});
