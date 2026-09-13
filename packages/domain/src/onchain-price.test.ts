import { expect, test } from "bun:test";

import { Schema } from "effect";

import {
  PriceObservation,
  matchesPriceThreshold,
  priceDecimalRatio,
  priceRatioDecimal,
} from "./onchain-price";

const available = Schema.decodeUnknownSync(PriceObservation)({
  v: 1,
  sourceKey: "fixture",
  network: "eip155:8453",
  blockNumber: 1,
  blockHash: `0x${"ab".repeat(32)}`,
  blockTime: 1,
  status: "available",
  price: "0.333333333333333333",
  numerator: "1",
  denominator: "3",
  reason: null,
  stubbed: false,
});
test("price thresholds compare exact rational values rather than displayed rounding", () => {
  expect(
    matchesPriceThreshold(
      available,
      "above",
      "0.333333333333333333333333333333333333333333333333333333333333333333333333333333"
    )
  ).toBe(true);
  expect(
    matchesPriceThreshold(available, "below", "0.333333333333333334")
  ).toBe(true);
  expect(priceRatioDecimal({ numerator: 1n, denominator: 8n })).toBe("0.125");
  expect(
    priceDecimalRatio("123456789012345678901234567890.123456789").numerator
  ).toBe(123_456_789_012_345_678_901_234_567_890_123_456_789n);
});
test("equal and unavailable samples cannot match; transport mode is enforced by the worker", () => {
  const equal = {
    ...available,
    numerator: "1",
    denominator: "2",
    price: "0.5",
  };
  expect(matchesPriceThreshold(equal, "above", "0.5")).toBe(false);
  expect(matchesPriceThreshold(equal, "below", "0.5")).toBe(false);
  expect(
    matchesPriceThreshold({ ...equal, stubbed: true }, "above", "0.1")
  ).toBe(true);
  expect(
    matchesPriceThreshold({ ...equal, status: "unavailable" }, "above", "0.1")
  ).toBe(false);
  expect(matchesPriceThreshold(equal, "above", "0")).toBe(false);
  expect(() => priceDecimalRatio("1e-9")).toThrow();
  expect(() => priceRatioDecimal({ numerator: 1n, denominator: 0n })).toThrow();
});
