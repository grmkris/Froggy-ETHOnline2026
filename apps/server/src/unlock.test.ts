import { describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";

import { renderUnlock, UnlockTokens } from "./unlock";
import type { UnlockedPurchase } from "./unlock";

const purchase: UnlockedPurchase = {
  amountLabel: "$0.0040",
  body: '{"answer":"Spark 4.27%"}',
  hcsSequence: 7,
  network: "hedera:testnet",
  purpose: "x402 payment for /oracle/snapshot",
  transactionId: "0.0.7162784@1788632323.333261031",
  url: "https://froggy.test/oracle/snapshot?symbol=USDC",
  userId: userId("did:privy:unlock-test"),
};

describe("UnlockTokens", () => {
  test("opens once, then says so", () => {
    const tokens = new UnlockTokens({ now: () => 1000 });
    const token = tokens.mint(purchase);

    expect(tokens.take(token)).toEqual({ kind: "open", purchase });
    expect(tokens.take(token)).toEqual({ kind: "used" });
  });

  test("expires, and forgets a token nobody minted", () => {
    const clock = { at: 1000 };
    const tokens = new UnlockTokens({ now: () => clock.at, ttlMs: 50 });
    const token = tokens.mint(purchase);
    clock.at = 1051;

    expect(tokens.take(token)).toEqual({ kind: "expired" });
    expect(tokens.take("not-a-token")).toEqual({ kind: "expired" });
  });

  test("tokens are not guessable from one another", () => {
    const tokens = new UnlockTokens();
    const a = tokens.mint(purchase);
    const b = tokens.mint(purchase);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});

describe("renderUnlock", () => {
  test("links the transaction to its explorer and escapes the seller's bytes", async () => {
    const response = renderUnlock({
      kind: "open",
      purchase: { ...purchase, body: "<script>alert(1)</script>" },
    });
    const html = await response.text();

    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("hashscan.io/testnet/transaction/");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("#7");
  });

  test("says when a page was already opened", async () => {
    const html = await renderUnlock({ kind: "used" }).text();
    expect(html).toContain("already opened");
  });
});
