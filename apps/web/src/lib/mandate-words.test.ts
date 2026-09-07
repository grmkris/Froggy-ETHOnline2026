import { describe, expect, it } from "bun:test";

import { networkWords } from "./mandate-words";

describe("networkWords", () => {
  it("names the chains a person meets", () => {
    expect(networkWords("eip155:8453")).toBe("Base");
    expect(networkWords("hedera:testnet")).toBe("Hedera testnet");
  });

  it("falls back to the id for a chain it has no name for", () => {
    expect(networkWords("eip155:10")).toBe("eip155:10");
  });
});
