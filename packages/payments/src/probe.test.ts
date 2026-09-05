import { describe, expect, it } from "bun:test";

import { assess, probe402 } from "./probe";

/** One `accepts` entry, as a seller writes it. */
interface Requirement {
  readonly amount: string;
  readonly asset: string;
  readonly extra?: { readonly feePayer?: string };
  readonly network: string;
  readonly payTo: string;
  readonly scheme: string;
}

const hedera: Requirement = {
  amount: "5000000",
  asset: "0.0.0",
  extra: { feePayer: "0.0.999" },
  network: "hedera:testnet",
  payTo: "0.0.5005",
  scheme: "exact",
};

/** What a fake seller answers with: a challenge, or something that is not one. */
interface SellerBody {
  readonly accepts?: readonly Requirement[];
  readonly hello?: number;
  readonly x402Version?: number;
}

const respond = (status: number, body?: SellerBody) => async () =>
  await Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );

describe("assess", () => {
  it("accepts an exact Hedera testnet challenge with a fee payer", () => {
    expect(assess(hedera)).toEqual({ reason: null, supported: true });
  });

  it("names the reason a challenge cannot be paid", () => {
    expect(assess({ ...hedera, scheme: "upto" }).reason).toContain("scheme");
    expect(assess({ ...hedera, network: "eip155:8453" }).reason).toContain(
      "eip155:8453"
    );
    expect(assess({ ...hedera, amount: "0" }).reason).toContain("tinybars");
    expect(assess({ ...hedera, extra: {} }).reason).toContain("fee payer");
  });
});

describe("probe402", () => {
  it("reads a payable challenge", async () => {
    const summary = await probe402(
      "https://seller.test/brief",
      respond(402, { accepts: [hedera], x402Version: 2 })
    );
    expect(summary).toMatchObject({
      host: "seller.test",
      kind: "paid",
      supported: true,
    });
  });

  it("reports an unsupported challenge with every reason", async () => {
    const summary = await probe402(
      "https://seller.test/brief",
      respond(402, {
        accepts: [
          { ...hedera, network: "eip155:8453" },
          { ...hedera, extra: {} },
        ],
        x402Version: 2,
      })
    );
    expect(summary.kind).toBe("paid");
    if (summary.kind === "paid") {
      expect(summary.supported).toBe(false);
      expect(summary.options.map((option) => option.reason)).toHaveLength(2);
    }
  });

  it("says when a page is free, or not an x402 seller at all", async () => {
    expect(await probe402("https://a.test", respond(200))).toMatchObject({
      kind: "free",
      status: 200,
    });
    expect(
      await probe402("https://a.test", respond(402, { hello: 1 }))
    ).toMatchObject({ kind: "unreachable" });
    expect(
      await probe402("https://a.test", async () => {
        await Promise.resolve();
        throw new Error("refused: private network");
      })
    ).toMatchObject({
      kind: "unreachable",
      reason: "refused: private network",
    });
  });
});
