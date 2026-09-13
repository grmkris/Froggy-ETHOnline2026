import { describe, expect, it } from "bun:test";

import { SaleId } from "@froggy/domain";
import { memoryStore } from "@froggy/wallet";

import { handleOracleRequest, handleSaleLookup } from "./oracle-route";

const ORIGIN = "https://froggy.test";
const URL_ = `${ORIGIN}/oracle/snapshot`;
const fixture = async (status: "delivered" | "uncertain" = "delivered") => {
  const store = memoryStore();
  const header = "historical-proof";
  const id = SaleId.generate();
  await store.sales.record({
    id,
    status,
    amount: "5000000",
    asset: "0.0.0",
    at: 1,
    deliveredAt: 2,
    error: null,
    network: "hedera:testnet",
    payer: "0.0.1",
    paymentHash: new Bun.CryptoHasher("sha256").update(header).digest("hex"),
    resource: `${URL_}?symbol=USDC`,
    stubbed: true,
    transactionId: "historical-tx",
    result: {
      answer: "Saved answer",
      capturedAt: 1,
      markets: [],
      snapshotHash: "saved-hash",
      source: "historical",
      stubbed: true,
    },
  });
  return { store, header, id, publicUrl: URL_ };
};

describe("retired anonymous oracle", () => {
  it("rejects unpaid and fresh signed requests without creating sales", async () => {
    const deps = { store: memoryStore(), publicUrl: URL_ };
    await Promise.all(
      [
        {},
        { "payment-signature": "fresh-proof" },
        { "x-payment": "legacy-proof" },
      ].map(async (headers) => {
        const response = await handleOracleRequest(
          deps,
          new Request(URL_, { headers })
        );
        expect(response.status).toBe(410);
        expect(response.headers.has("payment-required")).toBe(false);
        expect(await response.text()).toContain(`${ORIGIN}/mcp`);
      })
    );
    expect(
      await deps.store.sales.byPaymentHash(
        new Bun.CryptoHasher("sha256").update("fresh-proof").digest("hex")
      )
    ).toBeNull();
  });

  it("replays a historical purchased answer and preserves its settlement reference", async () => {
    const deps = await fixture();
    const response = await handleOracleRequest(
      deps,
      new Request(URL_, { headers: { "payment-signature": deps.header } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-froggy-sale")).toBe(deps.id);
    expect(await response.text()).toContain("Saved answer");
    const lookup = await handleSaleLookup(deps, deps.id);
    expect(lookup.status).toBe(200);
    expect(await lookup.text()).toContain("historical-tx");
  });

  it("keeps historical uncertain sales held and never treats migration as a refund", async () => {
    const deps = await fixture("uncertain");
    const response = await handleOracleRequest(
      deps,
      new Request(URL_, { headers: { "payment-signature": deps.header } })
    );
    expect(response.status).toBe(409);
    const saved = await deps.store.sales.byId(deps.id);
    expect(saved?.status).toBe("uncertain");
  });

  it("does not return another resource's stored answer", async () => {
    const deps = await fixture();
    const response = await handleOracleRequest(
      { ...deps, publicUrl: `${ORIGIN}/other` },
      new Request(URL_, { headers: { "payment-signature": deps.header } })
    );
    expect(response.status).toBe(410);
  });

  it("keeps missing sale ids private", async () => {
    const deps = { store: memoryStore() };
    const invalid = await handleSaleLookup(deps, "invalid");
    const missing = await handleSaleLookup(deps, SaleId.generate());
    expect(invalid.status).toBe(404);
    expect(missing.status).toBe(404);
  });
});
