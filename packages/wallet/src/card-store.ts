import {
  CardCheckout,
  CardVaultEnvelope,
  PaymentMethod,
  cardCheckoutReserved,
} from "@froggy/domain";
import type { CardCheckoutId, PaymentMethodId, UserId } from "@froggy/domain";
import { Schema } from "effect";

export interface CardBook {
  readonly methods: Map<PaymentMethodId, PaymentMethod>;
  readonly credentials: Map<PaymentMethodId, CardVaultEnvelope>;
  readonly checkouts: Map<CardCheckoutId, CardCheckout>;
}
export interface CardStore {
  readonly transact: <T>(
    owner: UserId,
    operation: (book: CardBook) => T
  ) => Promise<T>;
  readonly pendingOwners: () => Promise<readonly UserId[]>;
}
export const emptyCardBook = (): CardBook => ({
  methods: new Map(),
  credentials: new Map(),
  checkouts: new Map(),
});
const validateCheckoutRevision = (
  old: CardCheckout,
  checkout: CardCheckout
): void => {
  if (
    checkout.revision !== old.revision + 1 ||
    checkout.taskId !== old.taskId ||
    checkout.paymentMethodId !== old.paymentMethodId ||
    checkout.paymentMethodRevision !== old.paymentMethodRevision ||
    checkout.idempotencyKey !== old.idempotencyKey ||
    checkout.fundingAddress !== old.fundingAddress ||
    (old.paymentDispatchedAt !== null &&
      checkout.paymentDispatchedAt !== old.paymentDispatchedAt) ||
    (old.approvedAt !== null &&
      (checkout.approvedAt !== old.approvedAt ||
        checkout.fingerprint !== old.fingerprint ||
        !Bun.deepEquals(checkout.inspection, old.inspection, true) ||
        !Bun.deepEquals(checkout.funding, old.funding, true) ||
        checkout.tradeId !== old.tradeId)) ||
    (old.stoppedAt !== null && checkout.stoppedAt !== old.stoppedAt) ||
    (old.reconciledAt !== null && checkout.reconciledAt !== old.reconciledAt)
  ) {
    throw new Error(
      "card.immutable: an approved purchase cannot be changed or retried."
    );
  }
};
const retainCardRecords = (before: CardBook, after: CardBook): void => {
  for (const id of before.checkouts.keys()) {
    if (!after.checkouts.has(id)) {
      throw new Error(
        "card.retention: checkout recovery records cannot be deleted."
      );
    }
  }
  for (const id of before.methods.keys()) {
    if (!after.methods.has(id)) {
      throw new Error(
        "card.retention: revoke payment methods instead of deleting them."
      );
    }
  }
};
export const validateCardBook = (before: CardBook, after: CardBook): void => {
  if (after.methods.size > 20) {
    throw new Error("card.limit: at most twenty saved payment methods.");
  }
  for (const [id, candidate] of after.methods) {
    const method = Schema.decodeUnknownSync(PaymentMethod)(candidate);
    const old = before.methods.get(id);
    if (
      method.id !== id ||
      (old !== undefined &&
        !Bun.deepEquals(old, method, true) &&
        (old.revokedAt !== null || method.revision !== old.revision + 1))
    ) {
      throw new Error("card.revision: invalid payment method revision.");
    }
    const credentials = after.credentials.get(id);
    if (method.revokedAt === null && credentials === undefined) {
      throw new Error("card.vault: encrypted credentials missing.");
    }
    if (credentials !== undefined) {
      Schema.decodeUnknownSync(CardVaultEnvelope)(credentials);
    }
  }
  const keys = new Set<string>();
  const active = new Set<PaymentMethodId>();
  for (const [id, candidate] of after.checkouts) {
    const checkout = Schema.decodeUnknownSync(CardCheckout)(candidate);
    const old = before.checkouts.get(id);
    if (id !== checkout.id || keys.has(checkout.idempotencyKey)) {
      throw new Error("card.identity: duplicate checkout.");
    }
    keys.add(checkout.idempotencyKey);
    if (cardCheckoutReserved(checkout)) {
      if (active.has(checkout.paymentMethodId)) {
        throw new Error(
          "card.busy: reconcile the existing checkout before another purchase."
        );
      }
      active.add(checkout.paymentMethodId);
    }
    if (old === undefined || Bun.deepEquals(old, checkout, true)) {
      continue;
    }
    validateCheckoutRevision(old, checkout);
  }
  retainCardRecords(before, after);
};
export const memoryCardStore = (): CardStore => {
  const books = new Map<UserId, CardBook>();
  return {
    transact: async (owner, operation) => {
      await Promise.resolve();
      const before = books.get(owner) ?? emptyCardBook();
      const after = structuredClone(before);
      const result = structuredClone(operation(after));
      validateCardBook(before, after);
      books.set(owner, structuredClone(after));
      return result;
    },
    pendingOwners: async () => {
      await Promise.resolve();
      return [...books]
        .filter(([, book]) =>
          [...book.checkouts.values()].some(
            (checkout) =>
              checkout.bridge !== null &&
              (!checkout.bridge.destinationConfirmed ||
                !checkout.bridge.sourceConfirmed)
          )
        )
        .map(([owner]) => owner);
    },
  };
};
