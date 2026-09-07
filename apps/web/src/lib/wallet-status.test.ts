import { describe, expect, it } from "bun:test";

import { walletStatusOf } from "./wallet-status";

describe("walletStatusOf", () => {
  it("reads what the tool writes", () => {
    const text = JSON.stringify({
      address: "0xabc",
      rules: [{ _tag: "per_tx_cap", id: "r1", maxUsdMicros: 1 }],
      totalUsdMicros: 250_000,
      windowSpentUsdMicros: 4000,
    });
    expect(walletStatusOf(text)).toMatchObject({
      address: "0xabc",
      totalUsdMicros: 250_000,
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
