import { describe, expect, it } from "bun:test";

import { SaleId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import {
  handleX402Demo,
  X402_DEMO_PATH,
  X402_DEMO_REPORT_PATH,
} from "./x402-demo";

const ORIGIN = "https://froggy.test";
const handle = async (
  store: ReturnType<typeof memoryStore>,
  path: string,
  proof?: string
) => {
  const response = await handleX402Demo(
    { store },
    new Request(
      `${ORIGIN}${path}`,
      proof === undefined ? {} : { headers: { "payment-signature": proof } }
    )
  );
  if (response === null) {
    throw new Error("Expected demo route.");
  }
  return response;
};

describe("credit funding landing and historical reports", () => {
  it("explains account funding and links to the wallet without quoting a paid report", async () => {
    const response = await handle(memoryStore(), X402_DEMO_PATH);
    expect(response.status).toBe(200);
    expect(response.headers.has("payment-required")).toBe(false);
    const html = await response.text();
    expect(html).toContain("100 credits = $1");
    expect(html).toContain('href="/wallet"');
    expect(html).toContain("USDC on Base or native HBAR");
    expect(html).not.toContain("no account needed");
  });

  it("rejects both new signed and unpaid report requests before any sale", async () => {
    const store = memoryStore();
    const responses = await Promise.all(
      [undefined, "fresh-proof"].map(
        async (proof) => await handle(store, X402_DEMO_REPORT_PATH, proof)
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(410);
      expect(response.headers.has("payment-required")).toBe(false);
    }
    expect(
      await store.sales.byPaymentHash(
        new Bun.CryptoHasher("sha256").update("fresh-proof").digest("hex")
      )
    ).toBeNull();
  });

  it("serves the original stored report for an existing proof without paying or fetching again", async () => {
    const store = memoryStore();
    const proof = "historical-proof";
    const id = SaleId.generate();
    await store.sales.record({
      id,
      status: "delivered",
      amount: "5000000",
      asset: "0.0.0",
      at: 1,
      deliveredAt: 2,
      error: null,
      network: "hedera:testnet",
      payer: "0.0.1",
      paymentHash: new Bun.CryptoHasher("sha256").update(proof).digest("hex"),
      resource: `${ORIGIN}${X402_DEMO_REPORT_PATH}`,
      stubbed: true,
      transactionId: "historical-tx",
      result: {
        v: 1,
        html: "<!doctype html><title>Saved report</title>",
        stubbed: true,
      },
    });
    const response = await handle(store, X402_DEMO_REPORT_PATH, proof);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-froggy-sale")).toBe(id);
    expect(response.headers.has("payment-response")).toBe(true);
    expect(await response.text()).toContain("Saved report");
  });
});
