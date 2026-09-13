import { afterAll, describe, expect, it } from "bun:test";

import { SaleId } from "@froggy/domain";
import type { Sale } from "@froggy/domain";
import postgres from "postgres";

import { memoryStore } from "./store";
import type { Store } from "./store";
import { postgresStore } from "./store-postgres";

const legacySale = () => {
  const nanos = String(
    (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1_000_000_000
  ).padStart(9, "0");
  return {
    amount: "5000000",
    asset: "HBAR",
    at: Date.now() - 60_000,
    deliveredAt: Date.now() - 59_000,
    error: null,
    id: SaleId.generate(),
    network: "hedera:testnet",
    payer: "0.0.1234",
    paymentHash: crypto.randomUUID(),
    resource: "https://froggy.example/api/oracle/report",
    result: { report: "Historical paid result" },
    status: "delivered",
    stubbed: false,
    transactionId: `0.0.1234@${Math.floor(Date.now() / 1000)}.${nanos}`,
  } satisfies Sale;
};

const salesReplaySuite = (name: string, writer: Store, reader = writer) => {
  describe(name, () => {
    it("finds a persisted legacy payment by network and transaction, independent of its header hash", async () => {
      const sale = legacySale();
      await writer.sales.record(sale);
      expect(
        await reader.sales.byTransaction(sale.network, sale.transactionId)
      ).toEqual(sale);
      expect(
        await reader.sales.byTransaction("hedera:mainnet", sale.transactionId)
      ).toBeNull();
      expect(
        await reader.sales.byTransaction(
          sale.network,
          `${sale.transactionId}-other`
        )
      ).toBeNull();
      expect(await reader.sales.byPaymentHash("rewritten-header")).toBeNull();
    });

    it("finds a claimed transaction before delivery and after failed delivery", async () => {
      const sale = { ...legacySale(), status: "pending" as const };
      await writer.sales.record(sale);
      expect(
        await reader.sales.byTransaction(sale.network, sale.transactionId)
      ).toEqual(sale);
      await writer.sales.update(sale.id, {
        error: "Delivery failed after settlement",
        status: "failed",
      });
      const failed = await reader.sales.byTransaction(
        sale.network,
        sale.transactionId
      );
      expect(failed?.id).toBe(sale.id);
      expect(failed?.status).toBe("failed");
    });
  });
};

salesReplaySuite("memory legacy payment replay lookup", memoryStore());
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url !== undefined && url !== "") {
  const writer = postgres(url, { max: 2 });
  const reader = postgres(url, { max: 2 });
  afterAll(async () => {
    await Promise.all([writer.end({ timeout: 5 }), reader.end({ timeout: 5 })]);
  });
  salesReplaySuite(
    "Postgres legacy payment replay lookup across pools",
    postgresStore(writer),
    postgresStore(reader)
  );
} else {
  describe("Postgres legacy payment replay lookup", () => {
    it.skip("requires FROGGY_TEST_DATABASE_URL", () => {});
  });
}
