import { describe, expect, it } from "bun:test";

import {
  base58,
  canonicalise,
  caip10,
  universalAgentId,
} from "./agent-identity";

const FACTS = {
  name: "froggy-lending-oracle",
  nativeId: "hedera:mainnet:0.0.10847556",
  protocol: "x402",
  registry: "froggy",
  skills: [3, 1, 2],
  version: "1.0.0",
} as const;

describe("base58", () => {
  it("encodes the alphabet's own boundaries", () => {
    expect(base58(new Uint8Array([0]))).toBe("1");
    expect(base58(new Uint8Array([57]))).toBe("z");
    expect(base58(new Uint8Array([58]))).toBe("21");
    expect(base58(new Uint8Array([0, 0, 1]))).toBe("112");
  });
});

describe("canonicalise", () => {
  it("writes the six fields in the reference implementation's order, skills first", () => {
    // Byte-for-byte what `hashgraph-online/standards-sdk` hashes. The order is
    // the contract: alphabetical keys would be a different digest and so a
    // different identifier, and the point of publishing one is that a reader
    // can recompute it with the SDK and get ours back.
    expect(canonicalise(FACTS)).toBe(
      '{"skills":[1,2,3],"name":"froggy-lending-oracle","nativeId":"hedera:mainnet:0.0.10847556","protocol":"x402","registry":"froggy","version":"1.0.0"}'
    );
  });

  it("lowercases the registry and protocol and trims every field", () => {
    expect(
      canonicalise({ ...FACTS, protocol: " X402 ", registry: "FROGGY" })
    ).toBe(canonicalise(FACTS));
  });

  it("does not mutate the caller's skills", () => {
    const skills = [3, 1, 2];
    canonicalise({ ...FACTS, skills });
    expect(skills).toEqual([3, 1, 2]);
  });
});

describe("universalAgentId", () => {
  it("is deterministic, and changes when any fact changes", () => {
    const first = universalAgentId(FACTS);
    expect(first).toBe(universalAgentId(FACTS));
    expect(first).toStartWith("uaid:aid:");
    // `uid=0` is what the standard says when no registry assigned one.
    expect(first).toContain(";uid=0;registry=froggy;proto=x402;");
    expect(first).toContain("nativeId=hedera:mainnet:0.0.10847556");
    expect(universalAgentId({ ...FACTS, version: "1.0.1" })).not.toBe(first);
  });

  it("is the same for facts that differ only in case or spacing", () => {
    expect(universalAgentId({ ...FACTS, registry: " Froggy " })).toBe(
      universalAgentId(FACTS)
    );
  });
});

describe("caip10", () => {
  it("appends the account to a network that is already CAIP-2", () => {
    expect(caip10("hedera:mainnet", "0.0.10847556")).toBe(
      "hedera:mainnet:0.0.10847556"
    );
  });
});
