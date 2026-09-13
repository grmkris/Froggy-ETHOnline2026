import {
  cloudApi,
  CloudBrowser,
  StubCloudBrowser,
  hostedAgentApi,
  stubHostedAgent,
} from "@froggy/browser";
import type {
  BrowserHandle,
  BrowserSessionOptions,
  HostedAgentApi,
} from "@froggy/browser";
import { KNOWN_ASSETS } from "@froggy/domain";
import type { CreditPurchaseId, TradingNetwork, UserId } from "@froggy/domain";
import {
  Email,
  memoryEmailStore,
  postgresEmailStore,
  memoryEmailTransport,
  cloudflareEmailTransport,
} from "@froggy/email";
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
import type { GraphClient, SubgraphDiscovery } from "@froggy/graph";
import {
  liveGraphClient,
  liveSubgraphDiscovery,
  graphExplorer,
  stubGraphClient,
  stubSubgraphDiscovery,
} from "@froggy/graph";
import type {
  HcsWriter,
  OracleGate,
  Payer,
  RateSource,
} from "@froggy/payments";
import {
  evmCreditSettlement,
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
  EvmReads,
  EvmRpc,
  PrivyServer,
  SpendLedger,
  Store,
  TokenDomain,
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
  readTokenDomain,
  sendAuthorizedTransfer,
  sendErc20Transfer,
  stubPrivyServer,
} from "@froggy/wallet";
import type { Redacted } from "effect";
import postgres from "postgres";
import { erc20Abi, getAddress } from "viem";

import { CreditFunding } from "./credit-funding";
import type { Environment } from "./environment";
import { createHederaAccounts } from "./hedera-accounts";
import type { HederaAccounts } from "./hedera-accounts";
import { safeFetch } from "./outbound";
import { Purchases } from "./purchases";
import { indexedHolderFact, createResearchData } from "./research-data";
import { liveBirdeye, stubBirdeye } from "./trading/birdeye";
import { TradeCoordinator } from "./trading/coordinator";
import { tradeEvmClient } from "./trading/evm-chain";
import { executionProviders } from "./trading/execution-providers";
import { liveGoPlus, stubGoPlus } from "./trading/goplus";
import type { GoPlusScreen } from "./trading/goplus";
import type { ChainLaunchReader } from "./trading/launch-chain";
import { ponsLaunchReader, stubPonsLaunchReader } from "./trading/launch-chain";
import { LaunchCoordinator } from "./trading/launches";
import { PONS_NETWORK } from "./trading/networks";
import type { PonsReports } from "./trading/pons-report";
import { livePonsReports, stubPonsReports } from "./trading/pons-report";
import { usdcSignatureOptions } from "./trading/privy-execution";
import { liveTokenResearch, stubTokenResearch } from "./trading/research";
import { liveTradingRpc, stubTradingRpc } from "./trading/rpc";
import type { TradingProviders } from "./trading/services";
import { liveUniswap, stubUniswap } from "./trading/uniswap";
import { launchVenuesFor } from "./trading/venues";

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

const createEmail = (
  environment: Environment,
  sql: postgres.Sql | null
): Email | null => {
  if (environment.email) {
    if (!sql) {
      throw new Error("Live email requires durable Postgres storage.");
    }
    return new Email({
      store: postgresEmailStore(sql),
      transport: cloudflareEmailTransport(
        environment.email.workerUrl,
        environment.email.secret
      ),
      domain: environment.email.domain,
    });
  }
  if (environment.allowStubs) {
    return new Email({
      store: memoryEmailStore(),
      transport: memoryEmailTransport(),
      domain: "froggy.test",
    });
  }
  return null;
};
export interface Services {
  readonly creditFunding: CreditFunding;
  readonly hostedAgent: HostedAgentApi;
  readonly email: Email | null;
  readonly createBrowser: (
    options: BrowserSessionOptions,
    userId: UserId
  ) => BrowserHandle;
  readonly launches: LaunchCoordinator;
  readonly trading: TradingProviders;
  readonly purchases: Purchases;
  readonly trades: TradeCoordinator;
  readonly evmReceipt: EvmRpc["transactionReceipt"];
  /** Whether the chain has ever seen a transaction; see `transactionKnown`. */
  readonly evmTransactionKnown: EvmRpc["transactionKnown"];
  /** Node reads the injected wallet proxies, plus gas estimates for a page's tx. */
  readonly evmReads: EvmReads;
  readonly evmRpc: EvmRpc;
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
  /**
   * Transfers from one user's wallet that the treasury pays the gas for: the
   * person signs an EIP-3009 authorization under their policy and the
   * treasury wallet settles it under its own. Null when the agent has no
   * signer on the wallet, or this deployment has no treasury wallet to
   * relay through — and then the plain transfer above is all there is.
   */
  readonly evmRelayFor: (
    wallet: { readonly address: string; readonly id: string } | null
  ) => EvmTransfers | null;
  /** The chain the RPC answers for, so boot can refuse a URL on the wrong Base. */
  readonly evmChainId: () => Promise<number>;
  readonly graph: GraphClient;
  readonly graphExplorer: ReturnType<typeof graphExplorer>;
  readonly researchData: ReturnType<typeof createResearchData>;
  /** The Subgraph MCP: finds a deployment the registry did not pin, by name or by contract. */
  readonly graphDiscovery: SubgraphDiscovery;
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
  /** What an HBAR is worth. Read at boot and re-read on the server's clock; null when nothing knows. */
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
  const liveOr = <T>(
    live: boolean,
    name: string,
    makeLive: () => T,
    makeStub: () => T
  ): T => {
    if (live) {
      return makeLive();
    }
    if (!environment.allowStubs) {
      throw new Error(
        `${name} is not live; refusing a stub adapter off loopback.`
      );
    }
    return makeStub();
  };

  const ponsRpc = environment.trading.rpcEndpoints[PONS_NETWORK];
  // Same guarantee as `liveOr`, written out because the endpoint has to narrow
  // before it reaches the client rather than inside a thunk.
  const ponsReportsFor = (
    endpoint: Redacted.Redacted | undefined
  ): PonsReports => {
    if (endpoint !== undefined) {
      return livePonsReports(tradeEvmClient({ endpoint }), Date.now);
    }
    if (!environment.allowStubs) {
      throw new Error(
        "pons is not live; refusing a stub adapter off loopback."
      );
    }
    return stubPonsReports(Date.now);
  };
  const goplusFor = (baseUrl: string | null): GoPlusScreen => {
    if (environment.modes.goplus === "live" && baseUrl !== null) {
      return liveGoPlus({ baseUrl });
    }
    if (!environment.allowStubs) {
      throw new Error(
        "goplus is not live; refusing a stub adapter off loopback."
      );
    }
    return stubGoPlus();
  };
  const goplus = goplusFor(environment.trading.goplusApiUrl);
  const researchData = createResearchData(environment);
  const trading: TradingProviders = {
    market: liveOr(
      environment.modes.birdeye === "live",
      "birdeye",
      () => liveBirdeye({ apiKey: environment.trading.birdeyeApiKey }),
      stubBirdeye
    ),
    rpc: liveOr(
      environment.modes.quicknode === "live",
      "quicknode",
      () => liveTradingRpc({ endpoints: environment.trading.rpcEndpoints }),
      stubTradingRpc
    ),
    quotes: liveOr(
      environment.modes.uniswap === "live",
      "uniswap",
      () =>
        liveUniswap({
          apiKey: environment.trading.uniswapApiKey,
          chains: environment.trading.uniswapChains,
        }),
      stubUniswap
    ),
    pons: ponsReportsFor(ponsRpc),
    goplus,
    research: liveOr(
      environment.modes.quicknode === "live",
      "token_research",
      () => {
        const clients = new Map<string, ReturnType<typeof tradeEvmClient>>();
        const clientFor = (network: TradingNetwork) => {
          const existing = clients.get(network);
          if (existing !== undefined) {
            return existing;
          }
          const endpoint = environment.trading.rpcEndpoints[network];
          if (endpoint === undefined) {
            throw new Error(
              `research.rpc: no endpoint configured for ${network}.`
            );
          }
          const client = tradeEvmClient({ endpoint });
          clients.set(network, client);
          return client;
        };
        return liveTokenResearch({
          clientFor,
          venuesFor: (network) => launchVenuesFor(network, clientFor(network)),
          goplus,
          now: Date.now,
          indexedHolders: async (input, owner, client, blockNumber) => {
            const reading = await researchData.read(owner, {
              operation: "token_holders",
              network: input.network,
              address: input.address,
              limit: Math.min(input.topHolderCount ?? 10, 20),
            });
            const supply =
              reading.status === "observed"
                ? await client
                    .readContract({
                      address: getAddress(input.address),
                      abi: erc20Abi,
                      functionName: "totalSupply",
                      blockNumber,
                    })
                    .catch(() => null)
                : null;
            return indexedHolderFact(
              reading,
              supply?.toString() ?? null,
              input.topHolderCount ?? 10
            );
          },
        });
      },
      () => stubTokenResearch(Date.now)
    ),
  };

  const graph = liveOr(
    environment.modes.graph === "live",
    "graph",
    () =>
      liveGraphClient({
        apiKey: environment.graphApiKey,
        gatewayUrl: environment.graphGatewayUrl,
      }),
    stubGraphClient
  );
  // Same key, same mode: discovery is live exactly when the gateway is, so a
  // stubbed build can never present a real-looking search beside fixture data.
  const graphDiscovery = liveOr(
    environment.modes.graph === "live",
    "graph",
    () => liveSubgraphDiscovery({ apiKey: environment.graphApiKey }),
    stubSubgraphDiscovery
  );

  const oracle = liveOr(
    environment.modes.hedera === "live",
    "hedera",
    () =>
      liveOracleGate({
        asset: environment.hederaAsset,
        facilitatorUrl: environment.hederaFacilitatorUrl,
        network: environment.hederaNetwork,
        payTo: environment.hederaPayTo,
      }),
    stubOracleGate
  );

  const payer = liveOr(
    environment.modes.hedera === "live",
    "hedera",
    () =>
      liveHederaPayer({
        accountId: environment.hederaAccountId,
        network: environment.hederaNetwork,
        privateKey: environment.hederaPrivateKey,
      }),
    stubHederaPayer
  );

  const hcs = liveOr(
    environment.modes.hedera === "live",
    "hedera",
    () =>
      liveHcsWriter({
        accountId: environment.hederaAccountId,
        network: environment.hederaNetwork,
        privateKey: environment.hederaPrivateKey,
        topicId: environment.hederaHcsTopicId,
      }),
    stubHcsWriter
  );

  const rates = liveOr(
    environment.modes.hedera === "live",
    "hedera",
    () => liveHbarRates({ mirrorNodeUrl: environment.hederaMirrorNodeUrl }),
    stubHbarRates
  );

  const privy = liveOr(
    environment.modes.privy === "live",
    "privy",
    () =>
      livePrivyServer({
        agent: environment.privyAgent,
        appId: environment.privyAppId,
        appSecret: environment.privyAppSecret,
        hederaPolicyId: environment.privyHederaPolicyId,
        personOwnedPolicies: environment.privyPersonOwnedPolicies,
        signatureOptionsFor: usdcSignatureOptions(environment),
      }),
    stubPrivyServer
  );

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
  const email = createEmail(environment, sql);

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
  /**
   * How long a balance we did read stands in for one we could not.
   *
   * The public Base endpoint answers 429 under a burst, and an unreadable
   * USDC balance takes the whole dollar total down with it, because a total
   * that silently drops a side would look complete. Serving the last figure
   * we actually read, for a couple of minutes, keeps a rate limit from
   * blanking the wallet; past that it is honest to say unknown again.
   */
  const BALANCE_STALE_MS = 120_000;
  interface Reading {
    readonly at: number;
    /** The last figure a read actually returned, to stand in for a failure. */
    readonly good?: { readonly at: number; readonly value: bigint };
    readonly value: bigint | null;
  }
  const cached = new Map<string, Reading>();
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
    if (value !== null) {
      cached.set(key, { at: now, good: { at: now, value }, value });
      return value;
    }
    const good = hit?.good;
    const fresh = good !== undefined && now - good.at < BALANCE_STALE_MS;
    const served = fresh ? good.value : null;
    const next: Reading =
      good === undefined
        ? { at: now, value: served }
        : { at: now, good, value: served };
    cached.set(key, next);
    return served;
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
        // One retry: the public endpoint rate-limits a burst and the wallet
        // pane asks on every publish. A display figure, so the endpoint being
        // down reads as unknown, never as zero.
        const balanceOnce = async (): Promise<bigint | null> =>
          decodeUint256(await rpc.call(usdc.id, encodeBalanceOf(address)));
        try {
          return await balanceOnce();
        } catch {
          await Bun.sleep(250);
        }
        try {
          return await balanceOnce();
        } catch {
          return null;
        }
      }),
  };

  // The token's EIP-712 domain does not change; asked once, and only a
  // successful answer is kept, so an RPC hiccup is retried rather than
  // remembered for the life of the process.
  let usdcDomainRead: Promise<TokenDomain> | null = null;
  const usdcDomain = async (): Promise<TokenDomain> => {
    const read = usdcDomainRead ?? readTokenDomain(rpc, usdc.id);
    usdcDomainRead = read;
    try {
      return await read;
    } catch (error) {
      if (usdcDomainRead === read) {
        usdcDomainRead = null;
      }
      throw error;
    }
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
      environment.modes.privy === "live",
      environment.allowStubs,
      privy.execution
    ),
    now: Date.now,
  });

  let ponsReader: ChainLaunchReader | null = null;
  if (ponsRpc !== undefined) {
    ponsReader = ponsLaunchReader(
      tradeEvmClient({ endpoint: ponsRpc }),
      Date.now
    );
  } else if (environment.allowStubs) {
    ponsReader = stubPonsLaunchReader(Date.now);
  }
  let treasuryTail: Promise<null> = Promise.resolve(null);
  const withTreasuryLock = async <T>(
    operation: () => Promise<T>,
    purchaseId?: CreditPurchaseId
  ): Promise<T> => {
    const previous = treasuryTail;
    const turn = Promise.withResolvers<null>();
    treasuryTail = turn.promise;
    await previous;
    try {
      const connection = sql === null ? null : await sql.reserve();
      const lockKey = `treasury:${environment.evmNetwork}:${environment.treasuryWallet?.address ?? "unconfigured"}`;
      try {
        if (connection !== null) {
          await connection`select pg_advisory_lock(hashtextextended(${lockKey}, 0))`;
        }
        if (
          await store.credits.pendingSettlement(
            environment.evmNetwork,
            purchaseId
          )
        ) {
          throw new Error(
            "A treasury settlement is awaiting confirmation. No new transaction was signed."
          );
        }
        return await operation();
      } finally {
        if (connection !== null) {
          try {
            await connection`select pg_advisory_unlock(hashtextextended(${lockKey}, 0))`;
          } finally {
            connection.release();
          }
        }
      }
    } finally {
      turn.resolve(null);
    }
  };
  const adapters: Omit<
    Services,
    "purchases" | "createBrowser" | "creditFunding"
  > = {
    hostedAgent:
      environment.browserUseApiKey === null
        ? stubHostedAgent
        : hostedAgentApi({ apiKey: environment.browserUseApiKey }),

    email,
    launches: new LaunchCoordinator({
      store: store.launches,
      chainReaders:
        ponsReader === null
          ? new Map()
          : new Map([[ponsReader.network, ponsReader]]),
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
    evmRelayFor: (wallet) => {
      const treasury = environment.treasuryWallet;
      if (wallet === null || treasury === null) {
        return null;
      }
      const from = privy.signerFor(wallet);
      const relayer = privy.signerFor(treasury);
      if (from === null || relayer === null) {
        return null;
      }
      return {
        send: async ({ to, units, beforeBroadcast }) =>
          await withTreasuryLock(
            async () =>
              await sendAuthorizedTransfer({
                amount: units,
                beforeBroadcast,
                chainId: environment.evmChainId,
                domain: await usdcDomain(),
                from,
                relayer,
                rpc,
                to,
                token: usdc.id,
              })
          ),
      };
    },
    evmChainId: async () => await rpc.chainId(),
    evmReads: rpc,
    evmRpc: rpc,
    evmReceipt: rpc.transactionReceipt,
    evmTransactionKnown: rpc.transactionKnown,
    graph,
    graphDiscovery,
    graphExplorer: graphExplorer({
      apiKey: environment.graphApiKey,
      gatewayUrl: environment.graphGatewayUrl,
      stubbed: environment.modes.graph !== "live",
      fetch: async (url, init) =>
        await safeFetch(url, init, { maxRedirects: 0, timeoutMs: 20_000 }),
    }),
    researchData,
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
  const treasurySigner =
    environment.treasuryWallet === null
      ? null
      : privy.signerFor(environment.treasuryWallet);
  const creditFunding = new CreditFunding({
    ...adapters,
    base:
      treasurySigner === null
        ? null
        : evmCreditSettlement({
            network: environment.evmNetwork,
            rpcUrl: environment.evmRpcUrl,
            token: usdc.id,
            payTo: treasurySigner.address,
            relayer: treasurySigner,
          }),
    withTreasuryLock,
  });
  return {
    ...adapters,
    creditFunding,
    createBrowser: (browserOptions, userId) => {
      if (environment.browserUseApiKey === null) {
        if (!environment.allowStubs) {
          throw new Error(
            "browser is not live; refusing a stub adapter off loopback."
          );
        }
        return new StubCloudBrowser(browserOptions);
      }
      return new CloudBrowser({
        ...browserOptions,
        hostedApi: cloudApi({
          apiKey: environment.browserUseApiKey,
          country: environment.browserCountry,
          version: 4,
        }),
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
    purchases: new Purchases({ ...adapters, creditFunding }),
  };
};
