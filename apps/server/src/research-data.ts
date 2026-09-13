import type { HolderConcentrationFact, UserId } from "@froggy/domain";
import { Redacted, Schema } from "effect";

import type { Environment } from "./environment";
import { boundedBytes, safeFetch } from "./outbound";
import type { OutboundOptions } from "./outbound";

const Short = Schema.String.check(Schema.isMaxLength(200));
export const ResearchReadInput = Schema.Struct({
  operation: Schema.Literals([
    "networks",
    "wallet_assets",
    "token_holders",
    "token_transfers",
    "token_pools",
    "token_swaps",
    "prediction_search",
    "prediction_book",
    "prediction_activity",
    "perp_markets",
    "perp_activity",
    "perp_open_interest",
    "perp_liquidations",
    "defi_protocols",
    "defi_yields",
    "hedera_assets",
  ]),
  side: Schema.optional(
    Schema.Literals(["input", "output"]).annotate({
      description:
        "For swaps and EVM pools, which side contains this token. Default input; read both sides separately for broader coverage.",
    })
  ),
  network: Schema.optional(
    Short.annotate({
      description: "CAIP-2 or provider network name, e.g. eip155:8453 or base.",
    })
  ),
  address: Schema.optional(
    Short.annotate({
      description:
        "Exact wallet/token address; Hedera account ID for hedera_assets.",
    })
  ),
  query: Schema.optional(
    Short.annotate({
      description:
        "Search words, exact Hyperliquid coin, or Polymarket outcome token ID for books/activity.",
    })
  ),
  page: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 }))
  ),
  limit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))
  ),
});
export type ResearchReadInput = typeof ResearchReadInput.Type;
const Row = Schema.Record(Schema.String, Schema.Json);
const Rows = Schema.Array(Row);
const Pinax = Schema.Struct({ data: Rows });
const Networks = Schema.Struct({
  networks: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      caip2Id: Schema.String,
      indexed_to: Schema.Array(
        Schema.Struct({
          category: Schema.String,
          block_num: Schema.Number,
          timestamp: Schema.Number,
        })
      ),
    })
  ),
});
export interface ResearchReading {
  readonly v: 1;
  readonly status: "observed" | "unavailable" | "not_indexed";
  readonly provider: string;
  readonly observedAt: number;
  readonly source: string | null;
  readonly indexedAt: number | null;
  readonly stale: boolean | null;
  readonly data: readonly Schema.Json[];
  readonly nextPage: number | null;
  readonly truncated: boolean;
  readonly stubbed: boolean;
  readonly note: string;
}

export const createResearchData = (
  environment: Environment,
  outbound: OutboundOptions = {}
) => {
  const tokenConfigured =
    environment.pinaxApiKey !== null || environment.graphMarketToken !== null;
  const cache = new Map<string, { expires: number; result: ResearchReading }>();
  const budgets = new Map<string, { minute: number; count: number }>();
  let active = 0;
  const { now } = Date;
  const reserve = (owner: string) => {
    const minute = Math.floor(now() / 60_000);
    for (const key of [owner, "app"]) {
      const previous = budgets.get(key);
      const count = previous?.minute === minute ? previous.count : 0;
      if (count >= (key === "app" ? 120 : 30) || active >= 4) {
        throw new Error(
          "research.capacity: included read capacity reached; retry later. Nothing was charged."
        );
      }
    }
    if (budgets.size > 2000) {
      for (const [key, value] of budgets) {
        if (value.minute !== minute) {
          budgets.delete(key);
        }
      }
    }
    for (const key of [owner, "app"]) {
      const old = budgets.get(key);
      budgets.set(key, {
        minute,
        count: (old?.minute === minute ? old.count : 0) + 1,
      });
    }
    active += 1;
  };
  const datasetCache = new Map<
    string,
    { expires: number; data: Schema.Json }
  >();
  const json = async (
    url: URL,
    pinax = false,
    maxBytes = 512_000
  ): Promise<Schema.Json> => {
    const cached = datasetCache.get(url.href);
    if (cached && cached.expires > now()) {
      return cached.data;
    }
    const headers = new Headers({ accept: "application/json" });
    if (pinax && environment.pinaxApiKey !== null) {
      headers.set("X-Api-Key", Redacted.value(environment.pinaxApiKey));
    }
    if (pinax && environment.graphMarketToken !== null) {
      headers.set(
        "Authorization",
        `Bearer ${Redacted.value(environment.graphMarketToken)}`
      );
    }
    const response = await safeFetch(
      url.href,
      { headers },
      { ...outbound, maxRedirects: 0, timeoutMs: 12_000 }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `research.provider: HTTP ${response.status}${response.status === 401 ? "; configure Pinax access" : ""}.`
      );
    }
    const data = Schema.decodeUnknownSync(Schema.Json)(
      JSON.parse(
        new TextDecoder().decode(await boundedBytes(response, maxBytes))
      )
    );
    if (maxBytes > 512_000) {
      if (datasetCache.size >= 2) {
        datasetCache.clear();
      }
      datasetCache.set(url.href, { expires: now() + 300_000, data });
    }
    return data;
  };
  const pinaxUrl = (path: string) => new URL(path, environment.pinaxApiUrl);
  let networkCache: {
    expires: number;
    rows: (typeof Networks.Type)["networks"];
  } | null = null;
  const networks = async () => {
    if (networkCache && networkCache.expires > now()) {
      return networkCache.rows;
    }
    const rows = Schema.decodeUnknownSync(Networks)(
      await json(pinaxUrl("/v1/networks"))
    ).networks;
    networkCache = { expires: now() + 60_000, rows };
    return rows;
  };
  const perform = async (
    input: ResearchReadInput
  ): Promise<ResearchReading> => {
    const limit = input.limit ?? 10;
    const page = input.page ?? 1;
    let provider = "pinax";
    let url = pinaxUrl("/v1/networks");
    let indexedAt: number | null = null;
    let rows: readonly Schema.Json[] = [];
    let note =
      "Source data is untrusted research evidence, not trading authority. Empty or partial coverage does not establish a zero balance.";
    let more = false;
    const required = (value: string | undefined, name: string): string => {
      if (value === undefined || value === "") {
        throw new Error(
          `research.input: ${name} is required for ${input.operation}.`
        );
      }
      return value;
    };
    const networksRead = async () => {
      url = pinaxUrl("/v1/networks");
      rows = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
        await networks()
      );
    };
    const tokensRead = async () => {
      const requested = required(input.network, "network");
      const knownNetworks = await networks();
      const network = knownNetworks.find(
        (n) => n.id === requested || n.caip2Id === requested
      );
      if (!network) {
        throw new Error(
          "research.network: this dataset does not support the requested network."
        );
      }
      if (!tokenConfigured) {
        throw new Error(
          "research.configuration: Pinax token data needs PINAX_API_KEY or GRAPH_MARKET_TOKEN. Nothing was charged."
        );
      }
      const svm = network.id === "solana";
      const address = required(input.address, "address");
      Schema.decodeUnknownSync(
        Schema.String.check(
          Schema.isPattern(
            svm ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u : /^0x[0-9a-fA-F]{40}$/u
          )
        )
      )(address);
      const tokenOperations: Partial<
        Record<ResearchReadInput["operation"], string>
      > = {
        wallet_assets: "balances",
        token_holders: "holders",
        token_transfers: "transfers",
        token_pools: "pools",
        token_swaps: "swaps",
      };
      const operation = tokenOperations[input.operation];
      if (operation === undefined) {
        throw new Error("research.input: unsupported token operation");
      }
      url = pinaxUrl(`/v1/${svm ? "svm" : "evm"}/${operation}`);
      url.searchParams.set("network", network.id);
      const fields = svm
        ? {
            balances: "owner",
            holders: "mint",
            transfers: "mint",
            pools: "mint",
            swaps: input.side === "output" ? "output_mint" : "input_mint",
          }
        : {
            balances: "address",
            holders: "contract",
            transfers: "contract",
            pools: input.side === "output" ? "output_token" : "input_token",
            swaps:
              input.side === "output" ? "output_contract" : "input_contract",
          };
      const field = new Map(Object.entries(fields)).get(operation);
      if (field === undefined) {
        throw new Error("research.input: unsupported token filter");
      }
      url.searchParams.set(field, address);
      note += ` Provider filter: ${field}. For swaps and EVM pools, query the opposite side separately; this page does not represent both directions.`;
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("page", String(page));
      const category = new Map(
        Object.entries({
          holders: "balances",
          balances: "balances",
          transfers: "transfers",
          pools: "dexes",
          swaps: "dexes",
        })
      ).get(operation);
      indexedAt =
        (network.indexed_to.find((entry) => entry.category === category)
          ?.timestamp ?? 0) * 1000 || null;
      rows = Schema.decodeUnknownSync(Pinax)(await json(url, true)).data;
      more = rows.length === limit;
    };
    const predictionSearchRead = async () => {
      provider = "polymarket";
      url = new URL("/public-search", environment.polymarketGammaUrl);
      url.searchParams.set("q", required(input.query, "query"));
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit_per_type", String(limit));
      url.searchParams.set("events_status", "active");
      const body = Schema.decodeUnknownSync(
        Schema.Struct({ events: Schema.optionalKey(Rows) })
      )(await json(url));
      rows = (body.events ?? []).map((row) => ({
        id: row["id"] ?? null,
        title: row["title"] ?? null,
        slug: row["slug"] ?? null,
        markets: Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
          row["markets"] ?? []
        )
          .slice(0, 5)
          .map((m) => {
            const market = Schema.decodeUnknownSync(Row)(m);
            return {
              question: market["question"] ?? null,
              conditionId: market["conditionId"] ?? null,
              clobTokenIds: market["clobTokenIds"] ?? null,
              outcomes: market["outcomes"] ?? null,
              outcomePrices: market["outcomePrices"] ?? null,
              active: market["active"] ?? null,
              closed: market["closed"] ?? null,
            };
          }),
      }));
      more = rows.length >= limit;
    };
    const predictionBookRead = async () => {
      provider = "polymarket";
      url = new URL("/book", environment.polymarketClobUrl);
      url.searchParams.set(
        "token_id",
        required(input.query, "outcome token ID in query")
      );
      const book = Schema.decodeUnknownSync(Row)(await json(url));
      const levels = (
        value: Schema.Json | undefined,
        side: "bids" | "asks"
      ) => {
        const entries = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.Struct({
              price: Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+)?$/u)),
              size: Schema.String,
            })
          )
        )(value ?? []);
        more ||= entries.length > limit;
        return entries
          .toSorted((a, b) =>
            side === "bids"
              ? Number(b.price) - Number(a.price)
              : Number(a.price) - Number(b.price)
          )
          .slice(0, limit);
      };
      rows = [
        {
          ...book,
          bids: levels(book["bids"], "bids"),
          asks: levels(book["asks"], "asks"),
        },
      ];
      note =
        "Order book snapshot. Prices are not probabilities guaranteed by Froggy or executable fill promises.";
    };
    const marketsRead = async () => {
      const prediction = input.operation === "prediction_activity";
      const marketOperations: Partial<
        Record<ResearchReadInput["operation"], string>
      > = {
        prediction_activity: "activity",
        perp_markets: "",
        perp_activity: "activity",
        perp_open_interest: "oi",
        perp_liquidations: "liquidations",
      };
      const suffix = marketOperations[input.operation];
      if (suffix === undefined) {
        throw new Error("research.input: unsupported market operation");
      }
      url = pinaxUrl(
        `/v1/${prediction ? "polymarket" : "hyperliquid"}/markets${suffix ? `/${suffix}` : ""}`
      );
      if (input.query !== undefined && input.query !== "") {
        url.searchParams.set(prediction ? "token_id" : "coin", input.query);
      } else if (suffix) {
        required(input.query, "query");
      }
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("page", String(page));
      rows = Schema.decodeUnknownSync(Pinax)(await json(url, true)).data;
      more = rows.length === limit;
      note =
        "Indexed market observations; Hyperliquid datasets are provider PREVIEW. Missing funding or timestamps remain unknown. Use official order books for current executable liquidity.";
    };
    const hederaRead = async () => {
      if (page !== 1) {
        throw new Error(
          "research.input: Hedera reads return only the first bounded token page, with the provider continuation link."
        );
      }
      provider = "hedera-mirror";
      const account = required(input.address, "Hedera account ID in address");
      Schema.decodeUnknownSync(
        Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+$/u))
      )(account);
      url = new URL(
        `/api/v1/accounts/${account}/tokens`,
        environment.hederaMirrorNodeUrl
      );
      url.searchParams.set("limit", String(limit));
      const data = Schema.decodeUnknownSync(
        Schema.Struct({
          tokens: Rows,
          links: Schema.Struct({ next: Schema.NullOr(Schema.String) }),
        })
      )(await json(url));
      const accountData = Schema.decodeUnknownSync(
        Schema.Struct({ balance: Schema.Json })
      )(
        await json(
          new URL(
            `/api/v1/accounts/${account}`,
            environment.hederaMirrorNodeUrl
          )
        )
      );
      rows = [
        {
          account,
          balance: accountData.balance,
          tokens: data.tokens,
          next: data.links.next,
        },
      ];
      more = false;
      note =
        "Hedera Mirror Node account/token snapshot. Token pagination may be incomplete; no bridge or transfer is performed.";
    };
    const defiRead = async () => {
      provider = "defillama";
      url = new URL(
        input.operation === "defi_yields" ? "/pools" : "/protocols",
        input.operation === "defi_yields"
          ? environment.defiLlamaYieldsUrl
          : environment.defiLlamaApiUrl
      );
      const data = await json(url, false, 16 * 1024 * 1024);
      const all =
        input.operation === "defi_yields"
          ? Schema.decodeUnknownSync(Pinax)(data).data
          : Schema.decodeUnknownSync(Rows)(data);
      const q = input.query?.toLowerCase();
      const matched = all.filter(
        (row) =>
          q === undefined ||
          q === "" ||
          [
            row["name"],
            row["symbol"],
            row["project"],
            row["chain"],
            ...(Schema.is(Schema.Array(Schema.Json))(row["chains"])
              ? row["chains"]
              : []),
          ].some(
            (value) =>
              Schema.is(Schema.String)(value) && value.toLowerCase().includes(q)
          )
      );
      rows = matched
        .slice((page - 1) * limit, page * limit)
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([key]) =>
              [
                "name",
                "slug",
                "url",
                "symbol",
                "chain",
                "chains",
                "tvl",
                "tvlUsd",
                "apy",
                "apyBase",
                "apyReward",
                "project",
                "pool",
                "stablecoin",
                "exposure",
              ].includes(key)
            )
          )
        );
      more = matched.length > page * limit;
      note =
        "DefiLlama provider snapshot. Retrieval time is not the age of all constituent data. APY is variable; this is discovery, not an available deposit quote.";
    };
    if (input.operation === "networks") {
      await networksRead();
    } else if (
      input.operation.startsWith("token_") ||
      input.operation === "wallet_assets"
    ) {
      await tokensRead();
    } else if (input.operation === "prediction_search") {
      await predictionSearchRead();
    } else if (input.operation === "prediction_book") {
      await predictionBookRead();
    } else if (
      input.operation === "prediction_activity" ||
      input.operation.startsWith("perp_")
    ) {
      await marketsRead();
    } else if (input.operation === "hedera_assets") {
      await hederaRead();
    } else {
      await defiRead();
    }
    const bounded: Schema.Json[] = [];
    let bytes = 0;
    for (const row of rows.slice(0, limit)) {
      const size = JSON.stringify(row).length;
      if (bytes + size > 16_000) {
        more = true;
        break;
      }
      bounded.push(row);
      bytes += size;
    }
    return {
      v: 1,
      status: bounded.length ? "observed" : "not_indexed",
      provider,
      observedAt: now(),
      source: url.href,
      indexedAt,
      stale: indexedAt === null ? null : now() - indexedAt > 300_000,
      data: bounded,
      nextPage:
        more && page < 5 && input.operation !== "prediction_book"
          ? page + 1
          : null,
      truncated: more || rows.length > bounded.length,
      stubbed: false,
      note,
    };
  };
  const read = async (
    owner: UserId,
    input: ResearchReadInput
  ): Promise<ResearchReading> => {
    if (environment.researchMode === "stub") {
      return {
        v: 1,
        status: "unavailable",
        provider: "fixture",
        observedAt: now(),
        source: null,
        indexedAt: null,
        stale: null,
        data: [],
        nextPage: null,
        truncated: false,
        stubbed: true,
        note: "Research data is stubbed; no external request or charge.",
      };
    }
    let reserved = false;
    try {
      reserve(owner);
      reserved = true;
      const key = JSON.stringify(input);
      const existing = cache.get(key);
      if (existing && existing.expires > now()) {
        return existing.result;
      }
      const result = await perform(input);
      if (cache.size >= 256) {
        cache.clear();
      }
      cache.set(key, {
        expires:
          now() + (input.operation.startsWith("defi_") ? 300_000 : 15_000),
        result,
      });
      return result;
    } catch (error) {
      return {
        v: 1,
        status: "unavailable",
        provider: "research",
        observedAt: now(),
        source: null,
        indexedAt: null,
        stale: null,
        data: [],
        nextPage: null,
        truncated: false,
        stubbed: false,
        note:
          error instanceof Error && error.message.startsWith("research.")
            ? error.message
            : "research.response: provider data did not match the bounded contract.",
      };
    } finally {
      if (reserved) {
        active -= 1;
      }
    }
  };
  const limit = async <T>(
    owner: UserId,
    operation: () => Promise<T>
  ): Promise<T> => {
    reserve(owner);
    try {
      return await operation();
    } finally {
      active -= 1;
    }
  };
  return {
    read,
    limit,
    capabilities: () => ({
      v: 1,
      stubbed: environment.researchMode === "stub",
      included: true,
      limits: {
        perUserPerMinute: 30,
        appPerMinute: 120,
        concurrent: 4,
        rows: 20,
      },
      pinax: tokenConfigured ? "configured" : "credential_required",
      operations: ResearchReadInput.fields.operation.literals,
      execution:
        "No execution authority. Use trade_capabilities for trading routes.",
    }),
  };
};

export const indexedHolderFact = (
  reading: ResearchReading,
  totalSupply: string | null,
  count: number
): HolderConcentrationFact => {
  const empty: HolderConcentrationFact = {
    status: "unavailable",
    basis: "indexed",
    block: null,
    holdersCounted: 0,
    topHolderCount: count,
    topShareBps: null,
    denominator: "none",
    denominatorUnits: null,
    exclusions: [],
    supplyReconciled: false,
    coverage: "none",
    transfersRead: 0,
    pageBudget: 1,
    note: reading.note.slice(0, 500),
  };
  if (reading.status !== "observed" || reading.stale !== false) {
    return empty;
  }
  const decoded = Schema.decodeUnknownResult(
    Schema.Array(
      Schema.Struct({ amount: Schema.String.check(Schema.isPattern(/^\d+$/u)) })
    )
  )(reading.data);
  if (decoded._tag === "Failure") {
    return empty;
  }
  const supply = totalSupply === null ? 0n : BigInt(totalSupply);
  const total = decoded.success
    .slice(0, count)
    .reduce((sum, row) => sum + BigInt(row.amount), 0n);
  return {
    ...empty,
    status: "observed",
    holdersCounted: decoded.success.length,
    coverage: reading.truncated ? "partial" : "complete",
    denominator: supply > 0n ? "total" : "none",
    denominatorUnits: supply > 0n ? supply.toString() : null,
    topShareBps:
      supply > 0n &&
      total <= supply &&
      (decoded.success.length >= count || !reading.truncated)
        ? Number((total * 10_000n) / supply)
        : null,
    note: "Indexed top accounts; supply is an independent RPC observation at a different time. Not reconstructed signing evidence.",
  };
};
