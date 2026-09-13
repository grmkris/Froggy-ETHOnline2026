import { LaunchWatchInput } from "@froggy/domain";
import { Schema } from "effect";

import { LaunchWatchResult } from "./trading-launches";
import {
  MarketSearchInput,
  MarketSearchResult,
  TokenInspectInput,
  TokenInspectResult,
} from "./trading-market";
import { SwapQuoteInput, SwapQuoteResult } from "./trading-quote";
import { TokenResearchInput, TokenResearchResult } from "./trading-research";
import { RpcReadInput, RpcReadResult } from "./trading-rpc";

export const TradingServiceName = Schema.Literals([
  "watch_launches",
  "market_search",
  "token_inspect",
  "rpc_read",
  "quote_action",
  "token_research",
]);
export type TradingServiceName = typeof TradingServiceName.Type;

const requestFields = {
  v: Schema.Literals([2]),
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
};

export const LaunchWatchRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literal("watch_launches"),
  input: LaunchWatchInput,
});

export const MarketSearchRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literals(["market_search"]),
  input: MarketSearchInput,
});
export const TokenInspectRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literals(["token_inspect"]),
  input: TokenInspectInput,
});
export const RpcReadRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literals(["rpc_read"]),
  input: RpcReadInput,
});
export const SwapQuoteRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literals(["quote_action"]),
  input: SwapQuoteInput,
});
export const TokenResearchRequest = Schema.Struct({
  ...requestFields,
  service: Schema.Literals(["token_research"]),
  input: TokenResearchInput,
});

export const TradingServiceRequest = Schema.Union([
  LaunchWatchRequest,
  MarketSearchRequest,
  TokenInspectRequest,
  RpcReadRequest,
  SwapQuoteRequest,
  TokenResearchRequest,
]);
export type TradingServiceRequest = typeof TradingServiceRequest.Type;

export const TradingResult = Schema.Union([
  LaunchWatchResult,
  MarketSearchResult,
  TokenInspectResult,
  RpcReadResult,
  SwapQuoteResult,
  TokenResearchResult,
]);
export type TradingResult = typeof TradingResult.Type;
