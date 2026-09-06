import { describe, expect, it } from "bun:test";

import { walletStatusOf } from "./wallet-status";

describe("walletStatusOf", () => {
  it("reads what the tool writes", () => {
    const text = JSON.stringify({
      address: "0xabc",
      frozen: false,
      pocketUsdMicros: 250_000,
      rules: [{ _tag: "per_tx_cap", id: "r1", maxUsdMicros: 1 }],
      windowSpentUsdMicros: 4000,
    });
    expect(walletStatusOf(text)).toMatchObject({
      address: "0xabc",
      frozen: false,
      pocketUsdMicros: 250_000,
      windowSpentUsdMicros: 4000,
    });
    expect(walletStatusOf(text)?.rules?.map((rule) => rule._tag)).toEqual([
      "per_tx_cap",
    ]);
  });

  it("gives up quietly on anything else", () => {
    expect(walletStatusOf("{not json")).toBeNull();
    expect(walletStatusOf('{"other":1}')).toBeNull();
  });
});
