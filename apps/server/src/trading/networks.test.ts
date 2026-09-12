import { describe, expect, it } from "bun:test";

import { chainIdOf, PONS_NETWORK, SOLANA_MAINNET } from "./networks";

describe("chainIdOf", () => {
  it("reads an eip155 CAIP-2 identifier", () => {
    expect(chainIdOf(PONS_NETWORK)).toBe(4663);
    expect(chainIdOf("eip155:8453")).toBe(8453);
  });

  it("refuses a network that is not eip155, or not a safe integer", () => {
    expect(chainIdOf(SOLANA_MAINNET)).toBeNull();
    expect(chainIdOf("eip155:1.5")).toBeNull();
    expect(chainIdOf(`eip155:${Number.MAX_SAFE_INTEGER + 1}`)).toBeNull();
  });
});
