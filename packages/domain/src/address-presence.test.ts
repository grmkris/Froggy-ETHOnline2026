import { expect, test } from "bun:test";

import { Schema } from "effect";

import {
  AddressPresence,
  presenceTag,
  presenceTitle,
  visiblePresence,
} from "./address-presence";

const row = (
  network: string,
  overrides: Partial<AddressPresence> = {}
): AddressPresence =>
  Schema.decodeUnknownSync(AddressPresence)({
    network,
    status: "observed",
    kind: "eoa",
    block: "0x10",
    nativeBalance: "0",
    usdc: null,
    token: null,
    observedAt: 1,
    stubbed: false,
    note: null,
    ...overrides,
  });

test("visiblePresence hides testnets when a mainnet row is observed and shows them otherwise", () => {
  const base = row("eip155:8453");
  const sepolia = row("eip155:11155111");
  const baseSepolia = row("eip155:84532", { status: "absent" });
  expect(visiblePresence([sepolia, base, baseSepolia])).toEqual([base]);
  expect(visiblePresence([sepolia, baseSepolia])).toEqual([
    sepolia,
    baseSepolia,
  ]);
  const unavailable = row("eip155:1", { status: "unavailable", kind: null });
  expect(visiblePresence([unavailable, sepolia])).toEqual([
    unavailable,
    sepolia,
  ]);
});

test("presenceTag is token for a contract reporting symbol or decimals, wallet otherwise, null when nothing was observed", () => {
  const token = row("eip155:8453", {
    kind: "contract",
    token: { name: "Demo", symbol: "DEMO", decimals: 18, totalSupply: "1" },
  });
  const safe = row("eip155:1", {
    kind: "contract",
    token: { name: null, symbol: null, decimals: null, totalSupply: null },
  });
  const wallet = row("eip155:4663");
  expect(presenceTag([wallet, token])).toBe("token");
  expect(presenceTag([safe])).toBe("wallet");
  expect(presenceTag([wallet])).toBe("wallet");
  expect(presenceTag([row("eip155:1", { status: "absent" })])).toBe(null);
  expect(presenceTag([])).toBe(null);
  expect(
    presenceTag([
      row("eip155:8453", {
        kind: "contract",
        token: { name: null, symbol: null, decimals: 6, totalSupply: null },
      }),
    ])
  ).toBe("token");
});

test("presenceTitle prefers a visible chain's name over its symbol and skips hidden testnets", () => {
  const symbolOnly = row("eip155:1", {
    kind: "contract",
    token: { name: null, symbol: "SYM", decimals: 18, totalSupply: null },
  });
  const named = row("eip155:8453", {
    kind: "contract",
    token: {
      name: "Demo Coin",
      symbol: "DEMO",
      decimals: 18,
      totalSupply: null,
    },
  });
  const testnetNamed = row("eip155:84532", {
    kind: "contract",
    token: {
      name: "Test Coin",
      symbol: "TST",
      decimals: 18,
      totalSupply: null,
    },
  });
  expect(presenceTitle([symbolOnly, named])).toBe("SYM");
  expect(presenceTitle([named, symbolOnly])).toBe("Demo Coin");
  expect(presenceTitle([testnetNamed, row("eip155:8453")])).toBe(null);
  expect(presenceTitle([testnetNamed])).toBe("Test Coin");
  expect(presenceTitle([])).toBe(null);
});
