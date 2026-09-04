/**
 * The Graph, in two implementations behind one interface.
 *
 * The live one queries the decentralised network gateway with a Subgraph Studio
 * key. The stub returns a recorded fixture. Which one is running is a property
 * of the snapshot (`stubbed`) rather than a fact only the server knows, because
 * that flag has to survive all the way onto the receipt — a submission whose
 * Graph data was faked and whose UI did not say so would be misrepresenting the
 * one thing the track is judging.
 */

import { Result, Schema } from "effect";

import { FIXTURE_CAPTURED_AT, FIXTURE_MARKETS } from "./fixture";
import type { GraphClient, GraphSnapshot, LendingMarket } from "./types";

/**
 * Messari's standardized lending schema, queried once for every protocol.
 *
 * `totalBorrowBalanceUSD` and the rate array are schema fields, not
 * protocol-specific ones — that is the entire point of querying a standardized
 * subgraph rather than three bespoke ones.
 */
const LENDING_QUERY = `
  query CheapestBorrow($symbol: String!, $first: Int!) {
    markets(
      first: $first
      orderBy: totalBorrowBalanceUSD
      orderDirection: desc
      where: { inputToken_: { symbol: $symbol }, isActive: true }
    ) {
      name
      inputToken { symbol }
      totalBorrowBalanceUSD
      totalDepositBalanceUSD
      rates { rate side type }
    }
  }
`;

/**
 * The gateway's answer, decoded rather than asserted.
 *
 * Every field here is one the Messari standardized schema declares, and the
 * decode is what makes "standardized" mean something: a deployment that has
 * drifted fails loudly at the boundary instead of quietly producing `NaN` rates
 * that the agent would then reason about and spend against.
 */
const RawRate = Schema.Struct({
  rate: Schema.String,
  side: Schema.String,
  type: Schema.String,
});

const RawMarket = Schema.Struct({
  inputToken: Schema.Struct({ symbol: Schema.String }),
  name: Schema.String,
  rates: Schema.Array(RawRate),
  totalBorrowBalanceUSD: Schema.String,
  totalDepositBalanceUSD: Schema.String,
});

const GatewayResponse = Schema.Struct({
  data: Schema.optional(
    Schema.Struct({ markets: Schema.optional(Schema.Array(RawMarket)) })
  ),
  errors: Schema.optional(
    Schema.Array(Schema.Struct({ message: Schema.String }))
  ),
});

const decodeGatewayResponse = Schema.decodeUnknownResult(GatewayResponse);

type RawRate = typeof RawRate.Type;
type RawMarket = typeof RawMarket.Type;

const rateOf = (rates: readonly RawRate[], side: string): number => {
  const variable = rates.find((r) => r.side === side && r.type === "VARIABLE");
  const any = rates.find((r) => r.side === side);
  return Number((variable ?? any)?.rate ?? 0);
};

/**
 * A market's protocol, taken from its name.
 *
 * The standardized schema names the deployment ("Aave V3 USDC"), and the first
 * word is the protocol in every deployment we query. Deliberately not a lookup
 * table: an unrecognised protocol should show up as its own name in the answer,
 * not silently become "unknown".
 */
const protocolOf = (name: string): string =>
  name.split(/\s+/u)[0]?.toLowerCase() ?? "unknown";

const toMarket = (raw: RawMarket): LendingMarket => ({
  borrowApr: rateOf(raw.rates, "BORROWER"),
  inputTokenSymbol: raw.inputToken.symbol,
  name: raw.name,
  protocol: protocolOf(raw.name),
  supplyApr: rateOf(raw.rates, "LENDER"),
  totalBorrowUsd: Number(raw.totalBorrowBalanceUSD),
  totalSupplyUsd: Number(raw.totalDepositBalanceUSD),
});

const byCheapestBorrow = (a: LendingMarket, b: LendingMarket): number =>
  a.borrowApr - b.borrowApr;

export const stubGraphClient = (): GraphClient => ({
  lendingMarkets: async (symbol) => {
    await Promise.resolve();
    return {
      capturedAt: FIXTURE_CAPTURED_AT,
      markets: FIXTURE_MARKETS.filter(
        (m) => m.inputTokenSymbol.toUpperCase() === symbol.toUpperCase()
      ).toSorted(byCheapestBorrow),
      query: `lendingMarkets(${symbol})`,
      source: "fixture:messari-lending",
      stubbed: true,
    } satisfies GraphSnapshot;
  },
});

export interface LiveGraphOptions {
  readonly apiKey: string;
  /** Studio/network gateway base. Overridable so a self-hosted index can stand in. */
  readonly gatewayUrl?: string;
  /** Deployment queried for lending. One id, many protocols — that is the point. */
  readonly subgraphId: string;
}

const DEFAULT_GATEWAY = "https://gateway.thegraph.com/api";
const MARKET_LIMIT = 25;

export const liveGraphClient = (options: LiveGraphOptions): GraphClient => {
  const gateway = options.gatewayUrl ?? DEFAULT_GATEWAY;
  const url = `${gateway}/subgraphs/id/${options.subgraphId}`;

  return {
    lendingMarkets: async (symbol) => {
      const response = await fetch(url, {
        body: JSON.stringify({
          query: LENDING_QUERY,
          variables: { first: MARKET_LIMIT, symbol: symbol.toUpperCase() },
        }),
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          `The Graph gateway returned ${response.status} ${response.statusText}`
        );
      }
      const decoded = decodeGatewayResponse(await response.json());
      if (Result.isFailure(decoded)) {
        throw new Error(
          "The Graph gateway returned a body that does not match the standardized lending schema."
        );
      }
      const body = decoded.success;
      if (body.errors !== undefined && body.errors.length > 0) {
        throw new Error(
          `The Graph gateway rejected the query: ${body.errors
            .map((issue) => issue.message)
            .join("; ")}`
        );
      }
      return {
        capturedAt: Date.now(),
        markets: (body.data?.markets ?? [])
          .map(toMarket)
          .toSorted(byCheapestBorrow),
        query: `lendingMarkets(${symbol})`,
        source: url,
        stubbed: false,
      } satisfies GraphSnapshot;
    },
  };
};

/**
 * A digest of what the agent saw, for the receipt.
 *
 * The snapshot body is stored with the spend; this is what makes "the number it
 * acted on" checkable without re-reading the whole payload, and what makes a
 * later claim that the evidence was different falsifiable.
 */
export const snapshotHash = (snapshot: GraphSnapshot): string => {
  const canonical = JSON.stringify({
    capturedAt: snapshot.capturedAt,
    markets: snapshot.markets,
    query: snapshot.query,
    source: snapshot.source,
  });
  return new Bun.CryptoHasher("sha256").update(canonical).digest("hex");
};

/**
 * The one-line answer, and the reason it is worth paying for.
 *
 * Returned as prose because this string is both what the model reads and what
 * the paid endpoint sells. Keeping one formatter means the thing the buyer gets
 * cannot drift from the thing the agent reasoned about.
 */
export const describeCheapestBorrow = (snapshot: GraphSnapshot): string => {
  const [best] = snapshot.markets;
  if (best === undefined) {
    return "No active markets matched.";
  }
  const rest = snapshot.markets
    .slice(1, 4)
    .map((m) => `${m.name} ${m.borrowApr.toFixed(2)}%`)
    .join(", ");
  return `Cheapest ${best.inputTokenSymbol} borrow: ${best.name} at ${best.borrowApr.toFixed(2)}% APR ($${(best.totalBorrowUsd / 1e6).toFixed(0)}M borrowed).${rest === "" ? "" : ` Next: ${rest}.`}`;
};
