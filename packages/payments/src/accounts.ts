/**
 * Accounts for people, opened by the host.
 *
 * Each person gets a Hedera account of their own: an ECDSA key this server
 * generates, an account the host creates for that key with the EVM alias
 * derived from it, and an opening balance moved from the host's float. Later
 * top-ups are further transfers from the same float. The person's account is
 * what pays a 402, so a receipt and a seller's book name them as the payer,
 * not the host.
 *
 * The host account is the float and the operator: it pays the creation fee
 * and every transfer out of itself. The new key signs the creation too, which
 * is what proves the alias belongs to it.
 */

import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  PublicKey,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { mirrorNodeUrlForNetwork } from "@x402/hedera";
import { Schema } from "effect";

import type { HederaNetwork } from "./types";

export interface HederaHostOptions {
  readonly accountId: string;
  readonly network: HederaNetwork;
  /** ECDSA, `0x`-prefixed. */
  readonly privateKey: string;
}

interface OpenedAccount {
  readonly accountId: string;
  /** ECDSA, `0x`-prefixed, in the form `liveHederaPayer` takes. Seal it before storing. */
  readonly privateKey: string;
  /** The creation transaction, `0.0.x@seconds.nanos`, paid by the host. */
  readonly transactionId: string;
}

export interface HederaHost {
  readonly accountId: string;
  readonly close: () => void;
  /**
   * Moves `tinybars` from the host to an EVM alias nobody has used yet,
   * which is how Hedera creates an account for a key held elsewhere: the
   * account exists after this, owned by whoever holds that key.
   */
  readonly fundAlias: (
    evmAddress: string,
    tinybars: number
  ) => Promise<{ readonly transactionId: string }>;
  readonly network: HederaNetwork;
  /** Creates an account under a fresh key, funded with `tinybars` from the host. */
  readonly open: (tinybars: number) => Promise<OpenedAccount>;
  /** Moves `tinybars` from the host to `accountId`. Throws when the network refuses. */
  readonly transfer: (
    accountId: string,
    tinybars: number
  ) => Promise<{ readonly transactionId: string }>;
}

export class HederaAccountError extends Error {
  readonly kind = "HederaAccountError";

  constructor(message: string) {
    super(message);
    this.name = "HederaAccountError";
  }
}

/** A client with the host as operator, on the network the host lives on. */
export const hederaClient = (options: HederaHostOptions): Client =>
  (options.network === "hedera:mainnet"
    ? Client.forMainnet()
    : Client.forTestnet()
  ).setOperator(
    AccountId.fromString(options.accountId),
    PrivateKey.fromStringECDSA(options.privateKey)
  );

export const hederaHost = (options: HederaHostOptions): HederaHost => {
  const client = hederaClient(options);
  return {
    accountId: options.accountId,
    close: () => {
      client.close();
    },
    fundAlias: async (evmAddress, tinybars) => {
      const amount = Hbar.fromTinybars(tinybars);
      const submitted = await new TransferTransaction()
        .addHbarTransfer(
          AccountId.fromString(options.accountId),
          amount.negated()
        )
        .addHbarTransfer(AccountId.fromEvmAddress(0, 0, evmAddress), amount)
        .execute(client);
      await submitted.getReceipt(client);
      return { transactionId: submitted.transactionId.toString() };
    },
    network: options.network,
    open: async (tinybars) => {
      const key = PrivateKey.generateECDSA();
      const frozen = new AccountCreateTransaction()
        .setECDSAKeyWithAlias(key)
        .setInitialBalance(Hbar.fromTinybars(tinybars))
        .freezeWith(client);
      const signed = await frozen.sign(key);
      const submitted = await signed.execute(client);
      const receipt = await submitted.getReceipt(client);
      if (receipt.accountId === null) {
        throw new HederaAccountError(
          "Hedera accepted the account creation but returned no account id."
        );
      }
      return {
        accountId: receipt.accountId.toString(),
        privateKey: `0x${key.toStringRaw()}`,
        transactionId: submitted.transactionId.toString(),
      };
    },
    transfer: async (accountId, tinybars) => {
      const amount = Hbar.fromTinybars(tinybars);
      const submitted = await new TransferTransaction()
        .addHbarTransfer(
          AccountId.fromString(options.accountId),
          amount.negated()
        )
        .addHbarTransfer(AccountId.fromString(accountId), amount)
        .execute(client);
      // The receipt is where a failed transfer says so; the response only
      // says the network took the transaction.
      await submitted.getReceipt(client);
      return { transactionId: submitted.transactionId.toString() };
    },
  };
};

/** The EVM alias a compressed secp256k1 public key names, `0x`-prefixed. */
export const evmAliasOf = (publicKeyHex: string): string =>
  `0x${PublicKey.fromStringECDSA(publicKeyHex).toEvmAddress()}`;

const AliasAccount = Schema.Struct({ account: Schema.String });
const decodeAliasAccount = Schema.decodeUnknownResult(AliasAccount);

/**
 * The account id behind an EVM alias, from the mirror node, or null while the
 * mirror has not caught up (a few seconds after the creating transfer).
 */
export const resolveAlias = async (input: {
  readonly evmAddress: string;
  readonly network: HederaNetwork;
}): Promise<string | null> => {
  try {
    const response = await fetch(
      `${mirrorNodeUrlForNetwork(input.network)}/api/v1/accounts/${input.evmAddress}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) {
      return null;
    }
    const decoded = decodeAliasAccount(await response.json());
    return decoded._tag === "Success" ? decoded.success.account : null;
  } catch {
    return null;
  }
};
