import { creditUnits, EvmAddress, usdMicros } from "@froggy/domain";
import type { UserId, AgentConnectionId, TaskId } from "@froggy/domain";
import {
  LaunchWatchRequest,
  LaunchWatchTicket,
  MarketSearchRequest,
  RpcReadRequest,
  SwapQuoteRequest,
  TokenInspectRequest,
  TokenSnapshotRequest,
  TokenResearchRequest,
} from "@froggy/protocol";
import type {
  ServiceCard,
  ServiceRequest,
  ServiceResult,
  TradingResult,
  TradingServiceRequest,
} from "@froggy/protocol";
import { Schema } from "effect";

import type { Services } from "../services";
import { std } from "../std";
import { BIRDEYE_NETWORKS } from "./birdeye";
import type { liveBirdeye } from "./birdeye";
import type { GoPlusScreen } from "./goplus";
import { PONS_NETWORK, SOLANA_MAINNET } from "./networks";
import type { PonsReports } from "./pons-report";
import type { TokenResearch } from "./research";
import { preflightRpcRead } from "./rpc";
import type { TradingRpc } from "./rpc";
import { preflightSwapQuote, supportsUniswapChain } from "./uniswap";
import type { UniswapQuotes } from "./uniswap";

export interface TradingProviders {
  readonly market: ReturnType<typeof liveBirdeye>;
  readonly rpc: TradingRpc;
  readonly quotes: UniswapQuotes;
  /** Read-only Pons launch state on Robinhood. Never an input to a trade. */
  readonly pons: PonsReports;
  readonly research: TokenResearch;
  readonly goplus: GoPlusScreen;
}

export interface TradingServiceContext {
  readonly owner: UserId;
  readonly connectionId: AgentConnectionId | null;
  readonly sourceTaskId: TaskId;
  readonly paymentStubbed: boolean;
}

export const TRADING_TOOL_DEFINITIONS = [
  {
    name: "watch_launches",
    title: "Watch token listings",
    description:
      "One fixed-price watch, up to 60 minutes: sample up to 20 listings or native Pons logs every 30 seconds, with at most 120 polls and 100 saved matches. Native logs use bounded block cursors. No renewal or trading authority is created.",
    provider: "Birdeye / native Pons RPC",
    mode: "birdeye",
    schema: LaunchWatchRequest,
  },
  {
    name: "market_search",
    title: "Find tokens",
    description: "Search token markets or inspect up to 20 recent listings.",
    provider: "Birdeye",
    mode: "birdeye",
    schema: MarketSearchRequest,
  },
  {
    name: "token_inspect",
    title: "Inspect a token",
    description:
      "Market data and reported token controls, with unknowns kept visible.",
    provider: "Birdeye",
    mode: "birdeye",
    schema: TokenInspectRequest,
  },
  {
    name: "token_snapshot",
    title: "Token price and history",
    description:
      "A market snapshot with 24-hour and 7-day closing prices. Missing history stays visible. Retrieval is included.",
    provider: "Birdeye",
    mode: "birdeye",
    schema: TokenSnapshotRequest,
  },
  {
    name: "rpc_read",
    title: "Read chain state",
    description:
      "One bounded RPC read for balances, account state or transaction status.",
    provider: "Quicknode",
    mode: "quicknode",
    schema: RpcReadRequest,
  },
  {
    name: "quote_action",
    title: "Quote a swap",
    description:
      "An unsigned Uniswap ERC-20 quote and approval requirements. No trade is submitted.",
    provider: "Uniswap",
    mode: "uniswap",
    schema: SwapQuoteRequest,
  },
  {
    name: "token_research",
    title: "Research a token",
    description:
      "Composite due diligence at one pinned block: launcher identity, template match, launch cohort, holder concentration and GoPlus screen. Each source reports observed, not indexed, unavailable or not applicable.",
    provider: "RPC / GoPlus",
    mode: "quicknode",
    schema: TokenResearchRequest,
  },
] as const;

const DEMO_RPC_NETWORKS = [
  "eip155:8453",
  "eip155:84532",
  SOLANA_MAINNET,
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
] as const;

export const tradingCatalog = (services: Services): readonly ServiceCard[] => {
  const { environment } = services;
  return TRADING_TOOL_DEFINITIONS.map((definition) => {
    const providerLive =
      definition.name === "watch_launches"
        ? services.launches.networks(true).length > 0
        : environment.modes[definition.mode] === "live";
    const price = environment.trading.prices[definition.name];
    let networks: readonly string[] = BIRDEYE_NETWORKS;
    if (definition.name === "watch_launches") {
      networks = services.launches.networks(providerLive);
    } else if (definition.name === "quote_action") {
      networks = environment.trading.uniswapChains
        .filter(supportsUniswapChain)
        .map((chain) => chain.network);
    } else if (definition.name === "rpc_read") {
      networks = providerLive
        ? Object.keys(environment.trading.rpcEndpoints)
        : DEMO_RPC_NETWORKS;
    } else if (definition.name === "token_research") {
      networks = providerLive
        ? Object.keys(environment.trading.rpcEndpoints).filter((network) =>
            network.startsWith("eip155:")
          )
        : ["eip155:4663", "eip155:8453", "eip155:1"];
    }
    if (definition.name === "token_snapshot") {
      networks = networks.filter(
        (network) => network === "eip155:8453" || network === "eip155:4663"
      );
    }
    const available =
      networks.length > 0 &&
      (!providerLive || price !== undefined) &&
      (definition.name !== "token_snapshot" ||
        price === undefined ||
        price <= 1_000_000);
    let note =
      "Provider credentials and an explicit service price are required before a live purchase.";
    let status: ServiceCard["status"] = "unavailable";
    if (available && providerLive) {
      status = "configured";
      note =
        "One paid request; result retrieval is included. Trading capital is not spent.";
    } else if (available) {
      status = "demo";
      note = "Demo fixture using simulated credits. No live provider call.";
    }
    return {
      name: definition.name,
      title: definition.title,
      description: definition.description,
      provider: definition.provider,
      priceUsdMicros: usdMicros(price ?? (providerLive ? 0 : 10_000)),
      priceCreditUnits: creditUnits(price ?? (providerLive ? 0 : 10_000)),
      maxInput: 16_000,
      status,
      note,
      inputKind: "structured",
      networks,
      inputSchema: Schema.decodeUnknownSync(Schema.Json)(
        std(definition.schema)["~standard"].jsonSchema.input({
          target: "draft-2020-12",
        })
      ),
    };
  });
};

/** Checks with no provider side effects run before the durable paid task is claimed. */
export const preflightTrading = (
  services: Services,
  request: TradingServiceRequest
): void => {
  const card = tradingCatalog(services).find(
    (entry) => entry.name === request.service
  );
  if (card?.networks?.includes(request.input.network) !== true) {
    throw new Error(
      "This provider is not configured for the requested network. Nothing was charged."
    );
  }
  switch (request.service) {
    case "watch_launches": {
      if (
        request.input.network === PONS_NETWORK &&
        request.input.minimumLiquidityUsd !== null
      ) {
        throw new Error(
          "Native Pons launch logs have no verified USD liquidity value. Remove the USD filter; nothing was charged."
        );
      }
      break;
    }
    case "market_search": {
      if (request.input.query !== null && request.input.query.trim() === "") {
        throw new Error("A token search must contain non-whitespace text.");
      }
      break;
    }
    case "token_snapshot":
    case "token_inspect": {
      const evm = request.input.network.startsWith("eip155:");
      if (evm !== Schema.is(EvmAddress)(request.input.address)) {
        throw new Error(
          "The token address does not match the requested network."
        );
      }
      break;
    }
    case "rpc_read": {
      preflightRpcRead(request.input);
      break;
    }
    case "quote_action": {
      preflightSwapQuote(request.input);
      break;
    }
    case "token_research": {
      if (!request.input.network.startsWith("eip155:")) {
        throw new Error(
          "token_research is an EVM read. Choose an eip155 network; nothing was charged."
        );
      }
      if (!Schema.is(EvmAddress)(request.input.address)) {
        throw new Error(
          "The token address does not match the requested network."
        );
      }
      break;
    }
  }
};

export const serviceRequestText = (request: ServiceRequest): string => {
  if ("prompt" in request) {
    return request.prompt;
  }
  const { input } = request;
  switch (request.service) {
    case "watch_launches": {
      return `${request.input.durationMinutes}-minute listing watch · ${input.network} · ${request.input.durationMinutes * 2} polls maximum`;
    }
    case "market_search": {
      return `${request.input.query ?? "Recent listings"} · ${input.network} · up to ${request.input.limit} tokens`;
    }
    case "token_snapshot":
    case "token_inspect": {
      return `${request.input.address} · ${input.network}`;
    }
    case "rpc_read": {
      return `${request.input.call.method} · ${input.network}`;
    }
    case "quote_action": {
      return `${request.input.amount} base units of ${request.input.tokenIn} → ${request.input.tokenOut} · ${input.network}`;
    }
    case "token_research": {
      return `${request.input.address} · ${input.network} · cohort ${request.input.cohortWindowBlocks} blocks · ${request.input.holderPageBudget} holder pages`;
    }
  }
  throw new Error("Unsupported service request.");
};

const resultText = (data: TradingResult): string => {
  switch (data.operation) {
    case "watch_launches": {
      return `Watch ${data.watch.id}: ${data.watch.status}. Capacity: ${data.watch.maxPolls} polls until ${new Date(data.watch.expiresAt).toISOString()}. Read watch status for observations. No automatic renewal or trade authority.`;
    }
    case "market_search": {
      return `${data.tokens.length} token results on ${data.network}. ${data.tokens.map((token) => `${token.symbol ?? token.name ?? "Unnamed"}: ${token.address}`).join("\n")}`;
    }
    case "token_snapshot": {
      return `Token snapshot on ${data.network}. ${data.series.filter((series) => series.status === "observed").length} of 2 history windows available. Historical closes are in USD; gaps are not filled.`;
    }
    case "token_inspect": {
      return `${data.token.symbol ?? data.token.name ?? data.token.address} on ${data.network}. Price: ${data.token.priceUsd === null ? "unknown" : `$${data.token.priceUsd}`}. Security: ${data.security.status}; missing facts are unknown.`;
    }
    case "rpc_read": {
      return `${data.method} on ${data.network}. ${JSON.stringify(data.result).slice(0, 3000)}`;
    }
    case "quote_action": {
      return `Unsigned quote on ${data.network}: expected ${data.output.expectedAmount} output base units; minimum ${data.output.minimumAmount ?? "unknown"}. Approval: ${data.approval.status}. Refresh after ${new Date(data.refreshAfter).toISOString()}. No trade was submitted.`;
    }
    case "token_research": {
      const { data: facts } = data;
      return `Research on ${data.network}: launcher ${facts.launcher.launcher}/${facts.launcher.status}; template ${facts.template.status}${facts.template.matches === null ? "" : ` matches=${facts.template.matches}`}; cohort ${facts.cohort.status}/${facts.cohort.basis}; holders ${facts.holders.status}/${facts.holders.coverage}; screen ${facts.screen.status}.`;
    }
  }
  throw new Error("Unsupported trading result.");
};

export const runTradingService = async (
  services: Services,
  request: TradingServiceRequest,
  context?: TradingServiceContext
): Promise<ServiceResult> => {
  preflightTrading(services, request);
  let data: TradingResult;
  switch (request.service) {
    case "watch_launches": {
      if (context === undefined) {
        throw new Error(
          "watch.context: a settled, owner-bound paid task is required."
        );
      }
      const watch = await services.launches.create({
        ...context,
        input: request.input,
      });
      data = {
        v: 1,
        operation: "watch_launches",
        network: request.input.network,
        watch: Schema.decodeUnknownSync(LaunchWatchTicket)(watch),
        stubbed: watch.stubbed,
        limitations: [
          "Native Pons logs use confirmed block cursors with bounded backfill; provider listing snapshots have no replay cursor. Neither guarantees complete coverage.",
          "Native Pons factory logs establish observed membership, rechecked before signing. Other listing sources are unverified provider metadata.",
          "Capacity expires without renewal. Poll failures consume capacity. No trading authority is created.",
        ],
      };
      break;
    }
    case "market_search": {
      data = await services.trading.market.search(request.input);
      break;
    }
    case "token_snapshot": {
      data = await services.trading.market.snapshot(request.input);
      break;
    }
    case "token_inspect": {
      data = await services.trading.market.inspect(request.input);
      break;
    }
    case "rpc_read": {
      data = await services.trading.rpc.read(request.input);
      break;
    }
    case "quote_action": {
      data = await services.trading.quotes.quote(request.input);
      break;
    }
    case "token_research": {
      const facts = await services.trading.research.research(request.input);
      data = {
        v: 1,
        operation: "token_research",
        provider: "froggy",
        stubbed: facts.stubbed,
        observedAt: facts.observedAt,
        network: request.input.network,
        data: facts,
        limitations: [
          "Each source reports its own status. Absence of evidence is not a clean screen.",
          "Holder concentration from reconstructed Transfer history is capped by the page budget; partial coverage is never rounded into an authoritative number.",
          "GoPlus is research-visible only and never authorizes a trade.",
          "Research facts do not create trading authority.",
        ],
      };
      break;
    }
  }
  return {
    v: 1,
    service: request.service,
    stubbed: data.stubbed || context?.paymentStubbed === true,
    text: `${data.stubbed ? "DEMO — recorded fixture. " : ""}${resultText(data)}\n${data.limitations.join(" ")}`.slice(
      0,
      6000
    ),
    sources: [],
    artifact: null,
    upstreamTransactionId: null,
    data,
  };
};
