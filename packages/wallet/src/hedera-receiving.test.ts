import { afterAll, describe, expect, it } from "bun:test";

import { userId } from "@froggy/domain";
import postgres from "postgres";

import { memoryStore } from "./store";
import type { Store } from "./store";
import { postgresStore } from "./store-postgres";

const receivingStoreSuite = (name: string, first: Store, second = first) => {
  describe(name, () => {
    it("keeps one canonical receiving key across concurrent stores and never substitutes another key after funding", async () => {
      const owner = userId(`did:privy:receiving-${crypto.randomUUID()}`);
      const a = {
        kind: "privy" as const,
        walletId: "wallet-a",
        publicKey: "key-a",
      };
      const b = {
        kind: "privy" as const,
        walletId: "wallet-b",
        publicKey: "key-b",
      };
      const [one, two] = await Promise.all([
        first.hedera.prepareReceiving(owner, a),
        second.hedera.prepareReceiving(owner, b),
      ]);
      expect(one).toEqual(two);
      expect(one.accountId).toBeNull();
      expect(await first.hedera.load(owner)).toBeNull();
      expect(await second.hedera.loadReceiving(owner)).toEqual(one);
      const funded = { accountId: "0.0.1234", custody: one.custody };
      await first.hedera.save(owner, funded);
      const replay = await second.hedera.prepareReceiving(owner, b);
      expect(replay).toEqual(funded);
      expect(await first.hedera.load(owner)).toEqual(funded);
    });

    it("keeps pending receiving custody through forget without exposing it to a different owner", async () => {
      const owner = userId(`did:privy:receiving-${crypto.randomUUID()}`);
      const another = userId(`did:privy:receiving-${crypto.randomUUID()}`);
      const pending = await first.hedera.prepareReceiving(owner, {
        kind: "privy",
        walletId: "wallet-pending",
        publicKey: "key-pending",
      });
      await first.forget(owner);
      expect(await second.hedera.loadReceiving(owner)).toEqual(pending);
      expect(await second.hedera.loadReceiving(another)).toBeNull();
      expect(await second.hedera.load(owner)).toBeNull();
    });
  });
};

receivingStoreSuite("memory Hedera receiving custody", memoryStore());
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url !== undefined && url !== "") {
  const one = postgres(url, { max: 3 });
  const two = postgres(url, { max: 3 });
  afterAll(async () => {
    await Promise.all([one.end({ timeout: 5 }), two.end({ timeout: 5 })]);
  });
  receivingStoreSuite(
    "Postgres Hedera receiving custody across pools",
    postgresStore(one),
    postgresStore(two)
  );
} else {
  describe("Postgres Hedera receiving custody", () => {
    it.skip("requires FROGGY_TEST_DATABASE_URL", () => {});
  });
}
