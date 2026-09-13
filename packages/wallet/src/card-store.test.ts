import { afterAll, describe, expect, test } from "bun:test";

import {
  CardCheckoutId,
  PaymentMethodId,
  TaskId,
  EvmAddress,
  userId,
} from "@froggy/domain";
import type {
  CardCheckout,
  PaymentMethod,
  CardVaultEnvelope,
} from "@froggy/domain";
import { Schema } from "effect";
import postgres from "postgres";

import { memoryCardStore } from "./card-store";
import type { CardStore } from "./card-store";
import { postgresCardStore } from "./card-store-postgres";

const fixture = () => {
  const method: PaymentMethod = {
    v: 1,
    id: PaymentMethodId.generate(),
    revision: 1,
    label: "Synthetic card",
    fundingAddress: Schema.decodeUnknownSync(EvmAddress)(
      "0x2468246824682468246824682468246824682468"
    ),
    fundingNetwork: "eip155:59144",
    last4: "4242",
    createdAt: 1,
    revokedAt: null,
  };
  const envelope: CardVaultEnvelope = {
    v: 1,
    nonce: "0".repeat(24),
    ciphertext: "a".repeat(32),
  };
  const checkout: CardCheckout = {
    v: 1,
    id: CardCheckoutId.generate(),
    revision: 1,
    idempotencyKey: crypto.randomUUID(),
    paymentMethodId: method.id,
    paymentMethodRevision: 1,
    fundingAddress: method.fundingAddress,
    taskId: TaskId.generate(),
    stage: "inspecting",
    inspection: null,
    funding: null,
    fingerprint: null,
    expiresAt: null,
    approvedAt: null,
    tradeId: null,
    bridge: null,
    stoppedAt: null,
    paymentDispatchedAt: null,
    reconciledAt: null,
    providerRunId: null,
    order: null,
    charge: "unverified",
    error: null,
    createdAt: 1,
    updatedAt: 1,
    stubbed: true,
  };
  return { method, envelope, checkout };
};
const suite = (name: string, create: () => readonly [CardStore, CardStore]) => {
  describe(name, () => {
    test("owner isolation, credential separation, and restart persistence", async () => {
      const [first, second] = create();
      const data = fixture();
      const owner = userId(`did:privy:card-store-${crypto.randomUUID()}`);
      const other = userId(`did:privy:card-other-${crypto.randomUUID()}`);
      await first.transact(owner, (book) => {
        book.methods.set(data.method.id, data.method);
        book.credentials.set(data.method.id, data.envelope);
        book.checkouts.set(data.checkout.id, data.checkout);
      });
      const loaded = await second.transact(owner, (book) => ({
        method: book.methods.get(data.method.id),
        checkout: book.checkouts.get(data.checkout.id),
        envelope: book.credentials.get(data.method.id),
      }));
      expect(loaded).toEqual(data);
      expect(await second.transact(other, (book) => book.methods.size)).toBe(0);
      expect(JSON.stringify(loaded.checkout)).not.toContain("ciphertext");
      await second.transact(owner, (book) => {
        book.methods.set(data.method.id, {
          ...data.method,
          revision: 2,
          revokedAt: 2,
        });
        book.credentials.delete(data.method.id);
        book.checkouts.set(data.checkout.id, {
          ...data.checkout,
          revision: 2,
          stoppedAt: 2,
          stage: "stopped",
          updatedAt: 2,
        });
      });
      expect(await first.transact(owner, (book) => book.credentials.size)).toBe(
        0
      );
      expect(await first.transact(owner, (book) => book.checkouts.size)).toBe(
        1
      );
    });
    test("concurrent stores cannot reserve the same method twice", async () => {
      const [first, second] = create();
      const data = fixture();
      const owner = userId(`did:privy:card-race-${crypto.randomUUID()}`);
      await first.transact(owner, (book) => {
        book.methods.set(data.method.id, data.method);
        book.credentials.set(data.method.id, data.envelope);
      });
      const outcomes = await Promise.allSettled(
        [first, second].map(async (store) => {
          await store.transact(owner, (book) => {
            const checkout = {
              ...data.checkout,
              id: CardCheckoutId.generate(),
              idempotencyKey: crypto.randomUUID(),
            };
            book.checkouts.set(checkout.id, checkout);
          });
        })
      );
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled")
      ).toHaveLength(1);
      expect(await first.transact(owner, (book) => book.checkouts.size)).toBe(
        1
      );
    });
  });
};
suite("memory card store", () => {
  const store = memoryCardStore();
  return [store, store];
});
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url === undefined) {
  test.skip("Postgres card persistence requires FROGGY_TEST_DATABASE_URL", () => {});
} else {
  const first = postgres(url, { max: 3 });
  const second = postgres(url, { max: 3 });
  afterAll(async () => {
    await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
  });
  suite("Postgres card store", () => [
    postgresCardStore(first),
    postgresCardStore(second),
  ]);
}
