import { cloudApi, CloudBrowser, StubCloudBrowser } from "@froggy/browser";
import type { BrowserHandle, BrowserSessionOptions } from "@froggy/browser";
import { KNOWN_ASSETS } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
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
  hederaAccountBalance,
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
  EvmRpc,
  PrivyServer,
  SpendLedger,
  Store,
} from "@froggy/wallet";
import {
  aesGcmKeystore,
  decodeUint256,
  encodeBalanceOf,
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
import { Purchases } from "./purchases";
import { liveBirdeye, stubBirdeye } from "./trading/birdeye";
import { TradeCoordinator } from "./trading/coordinator";
import { tradeEvmClient } from "./trading/evm-chain";
import { executionProviders } from "./trading/execution-providers";
import { ponsLaunchReader, stubPonsLaunchReader } from "./trading/launch-chain";
import { LaunchCoordinator } from "./trading/launches";
import { liveTradingRpc, stubTradingRpc } from "./trading/rpc";
import type { TradingProviders } from "./trading/services";
import { liveUniswap, stubUniswap } from "./trading/uniswap";

/** A USDC transfer on the configured Base from one person's wallet, signed under the policy. */
interface EvmTransfers {
  readonly send: (input: {
    readonly to: string;
    /** USDC's smallest unit: six decimals. */
    readonly units: bigint;
    readonly beforeBroadcast?: ((hash: string) => Promise<void>) | undefined;
  }) => Promise<Erc20TransferOutcome>;
}

/** What the chains say someone holds. Display only; null when nothing answered. */
interface Balances {
  readonly hbar: (accountId: string) => Promise<bigint | null>;
  readonly usdc: (address: string) => Promise<bigint | null>;
}

export interface Services {
  readonly createBrowser: (
    options: BrowserSessionOptions,
    userId: UserId
  ) => BrowserHandle;
  readonly launches: LaunchCoordinator;
  readonly trading: TradingProviders;
  readonly purchases: Purchases;
  readonly trades: TradeCoordinator;
  readonly evmReceipt: EvmRpc["transactionReceipt"];
  /**
   * Hedera accounts of people's own, opened at first need from the host's
   * float; null when this deployment pays every Hedera leg from the host
   * pocket (no key-encryption key, or no live Hedera).
   */
  readonly accounts: HederaAccounts | null;
  /** Balances from the chains, cached briefly so a wallet pane does not poll the RPC per render. */
  readonly balances: Balances;
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
  /**
   * Froggy's own money on Base: the treasury wallet signing under its policy,
   * for what Froggy buys upstream (The Graph). Null without a treasury wallet
   * or an agent key.
   */
  readonly treasuryPayer: Payer | null;
}

/**
 * The name a person's provider profile is created under.
 *
 * Hashed rather than passed through: a Privy DID is the person's identity on
 * this deployment, and it has no business appearing in a third party's
 * dashboard, list endpoint or logs. Stable, so a returning user gets back the
 * profile they already logged into things with.
 */
export const providerUserKey = (userId: UserId): string =>
  new Bun.CryptoHasher("sha256").update(userId).digest("hex");

export interface ServiceOptions {
  readonly environment: Environment;
}

export const createServices = (options: ServiceOptions): Services => {
  const { environment } = options;
  const trading: TradingProviders = {
    market:
      environment.modes.birdeye === "live"
        ? liveBirdeye({ apiKey: environment.trading.birdeyeApiKey })
        : stubBirdeye(),
    rpc:
      environment.modes.quicknode === "live"
        ? liveTradingRpc({ endpoints: environment.trading.rpcEndpoints })
        : stubTradingRpc(),
    quotes:
      environment.modes.uniswap === "live"
        ? liveUniswap({
            apiKey: environment.trading.uniswapApiKey,
            chains: environment.trading.uniswapChains,
          })
        : stubUniswap(),
  };

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
          hederaPolicyId: environment.privyHederaPolicyId,
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
          keys: privy.hederaKeys,
          keystore: aesGcmKeystore(environment.hederaKek),
          rates,
          store,
        });

  // A short cache: the wallet pane asks on every publish and every socket
  // open, and a balance that is fifteen seconds old is still the balance.
  const BALANCE_TTL_MS = 15_000;
  const cached = new Map<string, { at: number; value: bigint | null }>();
  const remember = async (
    key: string,
    read: () => Promise<bigint | null>
  ): Promise<bigint | null> => {
    const hit = cached.get(key);
    const now = Date.now();
    if (hit !== undefined && now - hit.at < BALANCE_TTL_MS) {
      return hit.value;
    }
    const value = await read();
    cached.set(key, { at: now, value });
    return value;
  };
  const balances: Balances = {
    hbar: async (accountId) =>
      await remember(`hbar:${accountId}`, async () =>
        environment.modes.hedera === "live"
          ? await hederaAccountBalance({
              accountId,
              network: environment.hederaNetwork,
            })
          : null
      ),
    usdc: async (address) =>
      await remember(`usdc:${address}`, async () => {
        if (environment.modes.privy !== "live") {
          return null;
        }
        try {
          return decodeUint256(
            await rpc.call(usdc.id, encodeBalanceOf(address))
          );
        } catch {
          // A display figure: the RPC being down shows as unknown, not as zero.
          return null;
        }
      }),
  };

  const treasuryPayer = (): Payer | null => {
    const wallet = environment.treasuryWallet;
    if (wallet === null) {
      return null;
    }
    const signer = privy.signerFor(wallet);
    return signer === null
      ? null
      : evmPayer({ network: environment.evmNetwork, signer });
  };

  const trades = new TradeCoordinator({
    store: store.trading,
    watches: store.launches,
    privy,
    backend: executionProviders(
      environment.trading,
      environment.modes.privy === "live"
    ),
    now: Date.now,
  });

  const ponsRpc = environment.trading.rpcEndpoints["eip155:4663"];
  const ponsReader =
    ponsRpc === undefined
      ? stubPonsLaunchReader(Date.now)
      : ponsLaunchReader(tradeEvmClient({ endpoint: ponsRpc }), Date.now);
  const adapters: Omit<Services, "purchases" | "createBrowser"> = {
    launches: new LaunchCoordinator({
      store: store.launches,
      chainReaders: new Map([[ponsReader.network, ponsReader]]),
      market: trading.market,
      providerStubbed: environment.modes.birdeye === "stub",
      now: Date.now,
      revokeRules: async (owner, id) => {
        await trades.revokeWatchRules(owner, id);
      },
    }),
    trades,
    trading,
    accounts,
    balances,
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
        send: async ({ to, units, beforeBroadcast }) =>
          await sendErc20Transfer({
            amount: units,
            beforeBroadcast,
            chainId: environment.evmChainId,
            rpc,
            signer,
            to,
            token: usdc.id,
          }),
      };
    },
    evmChainId: async () => await rpc.chainId(),
    evmReceipt: rpc.transactionReceipt,
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
    treasuryPayer: treasuryPayer(),
  };
  return {
    ...adapters,
    createBrowser: (browserOptions, userId) => {
      if (environment.browserUseApiKey === null) {
        return new StubCloudBrowser(browserOptions);
      }
      return new CloudBrowser({
        ...browserOptions,
        api: cloudApi({
          apiKey: environment.browserUseApiKey,
          country: environment.browserCountry,
        }),
        userKey: providerUserKey(userId),
        load: async () => await store.browsers.load(userId),
        save: async (record) => {
          await store.browsers.save(userId, record);
        },
      });
    },
    purchases: new Purchases(adapters),
  };
};
