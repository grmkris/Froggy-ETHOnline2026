import { describe, expect, it } from "bun:test";

import { formatAmount, knownAsset, KNOWN_ASSETS } from "./money";

const BASE_USDC = KNOWN_ASSETS["eip155:8453:usdc"];

describe("knownAsset", () => {
  it("finds HBAR and an HTS token by id and network", () => {
    expect(knownAsset("0.0.0", "hedera:mainnet")?.symbol).toBe("HBAR");
    expect(knownAsset("0.0.456858", "hedera:mainnet")?.symbol).toBe("USDC");
  });

  it("compares eip155 ids without regard to hex case", () => {
    expect(knownAsset(BASE_USDC.id.toUpperCase(), "eip155:8453")).toEqual(
      BASE_USDC
    );
  });

  it("does not guess at an id this table does not have", () => {
    expect(knownAsset("0.0.999999", "hedera:mainnet")).toBeUndefined();
  });
});

describe("formatAmount", () => {
  it("reads tinybars as HBAR without rounding the number away", () => {
    expect(formatAmount("5000000", "0.0.0", "hedera:mainnet")).toBe(
      "0.05 HBAR"
    );
    expect(formatAmount("12683971", "0.0.0", "hedera:mainnet")).toBe(
      "0.12683971 HBAR"
    );
    expect(formatAmount("100000000", "0.0.0", "hedera:mainnet")).toBe("1 HBAR");
  });

  it("keeps base units for a token nobody here knows", () => {
    expect(formatAmount("42", "0.0.999999", "hedera:mainnet")).toBe(
      "42 units of token 0.0.999999"
    );
  });
});
