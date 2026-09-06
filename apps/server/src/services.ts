/**
 * The composition root's composition root.
 *
 * Every "live or stub?" decision happens here and nowhere else. Each adapter
 * package ships both implementations behind one interface; this file reads the
 * modes computed in `environment.ts` and picks. The rest of the server holds
 * interfaces and never learns which one it got.
 *
 * The browser is deliberately *not* here. `tools/graph.ts` forbids
 * `packages/browser` and `packages/wallet` from importing each other — the
 * browser is where hostile content lives and the wallet is where signing
 * happens — and since a Chrome now belongs to one user rather than the
 * process, it is `workspaces.ts` that owns it. This file owns everything a
 * user does not have their own copy of.
 */

import { KNOWN_ASSETS } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { GraphClient } from "@froggy/graph";
import { liveGraphClient, stubGraphClient } from "@froggy/graph";
import type {
  HcsWriter,
  OracleGate,
  Payer,
  RateSource,
} from "@froggy/payments";
import {
  evmPayer,
  hederaHost,
  liveHbarRates,
  liveHcsWriter,
  liveHederaPayer,
  liveOracleGate,
  stubHbarRates,
  stubHcsWriter,
  stubHederaPayer,
  stubOracleGate,
} from "@froggy/payments";
import type {
  Erc20TransferOutcome,
  PrivyServer,
  SpendLedger,
  Store,
} from "@froggy/wallet";
import {
  aesGcmKeystore,
  evmRpc,
  livePrivyServer,
  memoryLedger,
  memoryStore,
  postgresLedger,
  postgresStore,
  sendErc20Transfer,
  stubPrivyServer,
} from "@froggy/wallet";
import postgres from "postgres";

import type { Environment } from "./environment";
import { createHederaAccounts } from "./hedera-accounts";
import type { HederaAccounts } from "./hedera-accounts";

/** A USDC transfer on the configured Base from one person's wallet, signed under the policy. */
interface EvmTransfers {
  readonly send: (input: {
    readonly to: string;
    /** USDC's smallest unit: six decimals. */
    readonly units: bigint;
  }) => Promise<Erc20TransferOutcome>;
}

export interface Services {
  /**
   * Hedera accounts of people's own, opened at first need from the host's
   * float; null when this deployment pays every Hedera leg from the host
   * pocket (no key-encryption key, or no live Hedera).
   */
  readonly accounts: HederaAccounts | null;
  readonly environment: Environment;
  /**
   * Payers for the EVM legs, for one user's wallet, or none when the agent
   * has no signer on it. Built per call: the wallet is the user's, and the
   * signer is the agent key under the policy the user granted.
   */
  readonly evmPayersFor: (
    wallet: { readonly address: string; readonly id: string } | null
  ) => readonly Payer[];
  /**
   * Plain transfers from one user's wallet, or null when the agent has no
   * signer on it. Every transfer is signed by Privy under the committed
   * policy and broadcast by this process; a refusal is Privy's, verbatim.
   */
  readonly evmTransfersFor: (
    wallet: { readonly address: string; readonly id: string } | null
  ) => EvmTransfers | null;
  /** The chain the RPC answers for, so boot can refuse a URL on the wrong Base. */
  readonly evmChainId: () => Promise<number>;
  readonly graph: GraphClient;
  /**
   * Who pays the Hedera leg for this person: their own account, opened with
   * `openingUsdMicros` of HBAR when they have none, or the host pocket when
   * this deployment has no accounts. Throws with the reason when an account
   * cannot be opened; nothing falls back to the host under a person's name.
   */
  readonly hederaPayerFor: (input: {
    readonly openingUsdMicros: number;
    readonly userId: UserId;
  }) => Promise<Payer>;
  /** One public note per settlement, on a Hedera topic. A stub posts nothing. */
  readonly hcs: HcsWriter;
  readonly ledger: SpendLedger;
  readonly oracle: OracleGate;
  readonly payer: Payer;
  readonly privy: PrivyServer;
  /** What an HBAR is worth. Refreshed at boot; null when nothing knows. */
  readonly rates: RateSource;
  /** Releases anything this module acquired. Called from the server's scope. */
  readonly shutdown: () => Promise<void>;
  /** Mandates, receipts, sales, tasks and tokens; same live/stub split as the ledger. */
  readonly store: Store;
}

export interface ServiceOptions {
  readonly environment: Environment;
}

export const createServices = (options: ServiceOptions): Services => {
  const { environment } = options;

  const graph =
    environment.modes.graph === "live"
      ? liveGraphClient({
          apiKey: environment.graphApiKey,
          gatewayUrl: environment.graphGatewayUrl,
        })
      : stubGraphClient();

  const oracle =
    environment.modes.hedera === "live"
      ? liveOracleGate({
          facilitatorUrl: environment.hederaFacilitatorUrl,
          network: environment.hederaNetwork,
          payTo: environment.hederaPayTo,
        })
      : stubOracleGate();

  const payer =
    environment.modes.hedera === "live"
      ? liveHederaPayer({
          accountId: environment.hederaAccountId,
          network: environment.hederaNetwork,
          privateKey: environment.hederaPrivateKey,
        })
      : stubHederaPayer();

  const hcs =
    environment.modes.hedera === "live"
      ? liveHcsWriter({
          accountId: environment.hederaAccountId,
          network: environment.hederaNetwork,
          privateKey: environment.hederaPrivateKey,
          topicId: environment.hederaHcsTopicId,
        })
      : stubHcsWriter();

  const rates =
    environment.modes.hedera === "live"
      ? liveHbarRates({ mirrorNodeUrl: environment.hederaMirrorNodeUrl })
      : stubHbarRates();

  const privy =
    environment.modes.privy === "live"
      ? livePrivyServer({
          agent: environment.privyAgent,
          appId: environment.privyAppId,
          appSecret: environment.privyAppSecret,
        })
      : stubPrivyServer();

  // No `DATABASE_URL` means the ledger lives in memory: correct for one
  // process, lost on restart, and loudly reported as `database=stub` in the
  // wallet pane. With a URL the same interface is served by Postgres, where
  // the unique index on `(user_id, idempotency_key)` enforces idempotency
  // across processes and a cap survives a redeploy.
  const sql =
    environment.modes.database === "live"
      ? postgres(environment.databaseUrl, { idle_timeout: 20, max: 10 })
      : null;

  const rpc = evmRpc({ url: environment.evmRpcUrl });
  const usdc = KNOWN_ASSETS[`${environment.evmNetwork}:usdc`];
  const store = sql === null ? memoryStore() : postgresStore(sql);

  const host =
    environment.hederaAccounts && environment.hederaKek !== null
      ? hederaHost({
          accountId: environment.hederaAccountId,
          network: environment.hederaNetwork,
          privateKey: environment.hederaPrivateKey,
        })
      : null;
  const accounts =
    host === null || environment.hederaKek === null
      ? null
      : createHederaAccounts({
          host,
          keystore: aesGcmKeystore(environment.hederaKek),
          rates,
          store,
        });

  return {
    accounts,
    environment,
    evmPayersFor: (wallet) => {
      if (wallet === null) {
        return [];
      }
      const signer = privy.signerFor(wallet);
      if (signer === null) {
        return [];
      }
      return [
        evmPayer({ network: "eip155:8453", signer }),
        evmPayer({ network: "eip155:84532", signer }),
      ];
    },
    evmTransfersFor: (wallet) => {
      if (wallet === null) {
        return null;
      }
      const signer = privy.signerFor(wallet);
      if (signer === null) {
        return null;
      }
      return {
        send: async ({ to, units }) =>
          await sendErc20Transfer({
            amount: units,
            chainId: environment.evmChainId,
            rpc,
            signer,
            to,
            token: usdc.id,
          }),
      };
    },
    evmChainId: async () => await rpc.chainId(),
    graph,
    hcs,
    hederaPayerFor: async ({ openingUsdMicros, userId }) =>
      accounts === null
        ? payer
        : await accounts.payerFor(userId, openingUsdMicros),
    ledger: sql === null ? memoryLedger() : postgresLedger(sql),
    oracle,
    payer,
    privy,
    rates,
    shutdown: async () => {
      host?.close();
      await sql?.end({ timeout: 5 });
    },
    store,
  };
};
