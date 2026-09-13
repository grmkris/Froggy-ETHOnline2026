import { expect, test } from "bun:test";

import {
  CardCheckoutId,
  EvmAddress,
  PaymentMethodId,
  SessionId,
  TaskId,
  calculateCardFunding,
  userId,
} from "@froggy/domain";
import type { CardCredentials } from "@froggy/domain";
import { CardCheckoutApprove } from "@froggy/protocol";
import { memoryLedger, memoryStore, stubPrivyServer } from "@froggy/wallet";
import { Redacted, Schema } from "effect";

import { CardCheckouts } from "./card-checkouts";
import { stubCardRates } from "./card-rates";
import { CardVault } from "./card-vault";
import { WorkspaceSession } from "./session";
import { TradeCoordinator } from "./trading/coordinator";
import { stubTradeBackend } from "./trading/stub-execution";

const credentials: CardCredentials = {
  name: "Demo Shopper",
  number: "4242424242424242",
  expiryMonth: "12",
  expiryYear: "2030",
  cvc: "123",
};
const owner = userId("did:privy:card-test");
const other = userId("did:privy:other-card-test");
const destination = Schema.decodeUnknownSync(EvmAddress)(
  "0x2468246824682468246824682468246824682468"
);
const fixture = (units = "100000000") => {
  const store = memoryStore();
  let time = 100_000;
  const now = () => time;
  const privy = stubPrivyServer();
  const backend = stubTradeBackend(now);
  const trades = new TradeCoordinator({
    store: store.trading,
    privy,
    backend: () => backend,
    now,
  });
  const session = new WorkspaceSession(
    SessionId.generate(),
    owner,
    {
      store,
      ledger: memoryLedger(),
      modes: {
        browser: "stub",
        database: "stub",
        graph: "stub",
        hedera: "stub",
        model: "stub",
        privy: "stub",
        telegram: "stub",
      },
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      networks: { evm: "eip155:8453", hedera: "hedera:testnet" },
      quote: () => null,
      onPolicyDecision: () => {},
      onReceipt: () => {},
      now,
    },
    { hosts: [], payeeIds: [] }
  );
  const cards = new CardCheckouts({
    enabled: true,
    liveCardEntry: false,
    store: store.cards,
    trades,
    privy,
    now,
    rates: stubCardRates(now),
    vault: new CardVault(Redacted.make("a".repeat(64))),
    linea: {
      stubbed: true,
      balance: async () =>
        await Promise.resolve({ units, block: "10", observedAt: now() }),
      observe: async (_input, _minimum, previous) =>
        await Promise.resolve({
          ...previous,
          sourceTransaction: `0x${"1".repeat(64)}`,
          sourceConfirmed: true,
          destinationConfirmed: true,
          depositId: "1",
          fillTransaction: `0x${"2".repeat(64)}`,
        }),
    },
  });
  return {
    store,
    cards,
    context: { session, connectionId: null },
    advance: () => {
      time += 60_001;
    },
  };
};
const inspection = JSON.stringify({
  v: 1,
  merchant: "shop.example",
  item: "Demo item",
  total: "20.00",
  currency: "USD",
  finalTotal: true,
  paymentHosts: ["pay.example"],
});
const prepare = async (f: ReturnType<typeof fixture>) => {
  const method = await f.cards.saveMethod(owner, {
    v: 1,
    label: "Demo",
    fundingAddress: destination,
    credentials,
  });
  const checkout = await f.cards.prepare(
    owner,
    method.id,
    TaskId.generate(),
    crypto.randomUUID()
  );
  return {
    method,
    checkout: await f.cards.inspect(f.context, checkout.id, inspection),
  };
};
const answer = (fingerprint: string | null) =>
  Schema.decodeUnknownSync(CardCheckoutApprove)({
    v: 1,
    fingerprint,
    tradeAnswer: null,
  });

test("FX rounds up to USDC precision, adds 5% or $1 and accounts for reservations", () => {
  const input = {
    total: "0.01",
    rate: "3",
    usdRate: "1",
    balance: "0",
    reserved: "0",
    now: 100,
    rateAt: 100,
    balanceAt: 100,
    stubbed: false,
  };
  const funding = calculateCardFunding(input);
  expect(funding.cost).toBe("3334");
  expect(funding.buffer).toBe("1000000");
  expect(funding.shortfall).toBe("1003334");
  expect(
    calculateCardFunding({
      ...input,
      total: "100",
      rate: "1",
      balance: "110000000",
      reserved: "10000000",
    }).shortfall
  ).toBe("5000000");
  expect(() => calculateCardFunding({ ...input, now: 60_101 })).toThrow(
    "stale"
  );
  expect(() => calculateCardFunding({ ...input, rate: "0" })).toThrow();
});

test("vault authenticates owner, method, revision and ciphertext with fresh nonces", async () => {
  const vault = new CardVault(Redacted.make("a".repeat(64)));
  const id = PaymentMethodId.generate();
  const first = await vault.seal(owner, id, 1, credentials);
  const second = await vault.seal(owner, id, 1, credentials);
  expect(first.nonce).not.toBe(second.nonce);
  expect(JSON.stringify(first)).not.toContain(credentials.number);
  expect(await vault.open(owner, id, 1, first)).toEqual(credentials);
  await expect(vault.open(other, id, 1, first)).rejects.toThrow(
    "authenticated"
  );
  await expect(vault.open(owner, id, 2, first)).rejects.toThrow(
    "authenticated"
  );
  await expect(
    vault.open(owner, PaymentMethodId.generate(), 1, first)
  ).rejects.toThrow("authenticated");
  await expect(
    vault.open(owner, id, 1, {
      ...first,
      ciphertext: `00${first.ciphertext.slice(2)}`,
    })
  ).rejects.toThrow("authenticated");
});

test("saved methods are owner-scoped and only masked metadata leaves the vault", async () => {
  const f = fixture();
  const { method, checkout } = await prepare(f);
  expect(method.fundingAddress).toBe(destination);
  expect(method.last4).toBe("4242");
  expect(JSON.stringify(await f.cards.methods(owner))).not.toContain(
    credentials.number
  );
  const otherMethods = await f.cards.methods(other);
  expect(otherMethods.methods).toHaveLength(0);
  await expect(f.cards.get(other, checkout.id)).rejects.toThrow("not found");
  await expect(f.cards.revoke(other, method.id)).rejects.toThrow("not found");
});

test("existing balance needs no trade, duplicate approval is idempotent, dispatch claims once", async () => {
  const f = fixture();
  const { checkout } = await prepare(f);
  expect(checkout.tradeId).toBeNull();
  expect(checkout.funding?.baseDebit).toBe("0");
  await f.cards.approve(
    f.context,
    checkout.id,
    answer(checkout.fingerprint),
    "owner-token"
  );
  await f.cards.approve(
    f.context,
    checkout.id,
    answer(checkout.fingerprint),
    "owner-token"
  );
  await expect(
    f.cards.dispatchCredentials(owner, checkout.id, {
      merchant: "evil.example",
      hosts: ["pay.example"],
    })
  ).rejects.toThrow("dispatch");
  const released = await f.cards.dispatchCredentials(owner, checkout.id, {
    merchant: "shop.example",
    hosts: ["pay.example"],
  });
  expect(JSON.stringify(released)).toBe(JSON.stringify(credentials));
  await expect(
    f.cards.dispatchCredentials(owner, checkout.id, {
      merchant: "shop.example",
      hosts: ["pay.example"],
    })
  ).rejects.toThrow("dispatch");
  await expect(
    f.cards.prepare(
      owner,
      checkout.paymentMethodId,
      TaskId.generate(),
      "retry-purchase"
    )
  ).rejects.toThrow("busy");
});

test("card replacement and revocation invalidate pending approvals", async () => {
  const f = fixture();
  const { method, checkout } = await prepare(f);
  await f.cards.saveMethod(
    owner,
    {
      v: 1,
      label: "Replaced",
      fundingAddress: destination,
      credentials,
      expectedRevision: method.revision,
    },
    method.id
  );
  await expect(
    f.cards.approve(
      f.context,
      checkout.id,
      answer(checkout.fingerprint),
      "owner-token"
    )
  ).rejects.toThrow("method");
  await f.cards.revoke(owner, method.id);
  expect(
    await f.store.cards.transact(owner, (book) =>
      book.credentials.has(method.id)
    )
  ).toBe(false);
});

test("malformed inspection and stale approvals cannot debit or release credentials", async () => {
  const f = fixture();
  const { checkout } = await prepare(f);
  f.advance();
  await expect(
    f.cards.approve(
      f.context,
      checkout.id,
      answer(checkout.fingerprint),
      "owner-token"
    )
  ).rejects.toThrow("approval");
  await f.cards.stop(owner, checkout.id);
  const next = await f.cards.prepare(
    owner,
    checkout.paymentMethodId,
    TaskId.generate(),
    "new-inspection"
  );
  const result = await f.cards.inspect(f.context, next.id, '{"total":"20"}');
  expect(result.stage).toBe("needs_help");
  expect(result.tradeId).toBeNull();
});

test("a shortfall uses the existing trade ledger and an exact owner answer", async () => {
  const f = fixture("0");
  const { checkout } = await prepare(f);
  expect(checkout.tradeId).not.toBeNull();
  expect(checkout.funding?.shortfall).toBe("21000000");
  const { tradeId } = checkout;
  if (tradeId === null) {
    throw new Error("Missing bridge trade");
  }
  const trade = await f.store.trading.transact(owner, (book) =>
    book.trades.get(tradeId)
  );
  const step = trade?.steps[0];
  if (step === undefined) {
    throw new Error("Missing bridge step");
  }
  const approved = await f.cards.approve(
    f.context,
    checkout.id,
    {
      ...answer(checkout.fingerprint),
      tradeAnswer: {
        v: 1,
        decision: "allow_once",
        approvalId: step.approvalId,
        fingerprint: step.fingerprint,
        stepId: step.id,
      },
    },
    "owner-token"
  );
  expect(approved.bridge?.sourceConfirmed).toBe(true);
  expect(approved.bridge?.destinationConfirmed).toBe(true);
  expect(approved.stage).toBe("paying");
});

test("different owners cannot read checkout documents with a guessed id", async () => {
  const f = fixture();
  await expect(f.cards.get(other, CardCheckoutId.generate())).rejects.toThrow(
    "not found"
  );
});
