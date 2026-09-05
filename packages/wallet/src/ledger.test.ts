import { describe, expect, it } from "bun:test";

import { SpendId, usdMicros, userId } from "@froggy/domain";

import { memoryLedger } from "./ledger";

const user = userId("did:privy:ledger-test");
const NOW = 1_756_000_000_000;

const row = (key: string, micros: number) => ({
  at: NOW,
  id: SpendId.generate(),
  idempotencyKey: key,
  userId: user,
  usdMicros: usdMicros(micros),
});

describe("memoryLedger", () => {
  it("reserves a spend before anything is paid", async () => {
    const ledger = memoryLedger();

    const reserved = await ledger.reserve(row("a", 10_000));

    // Written first on purpose: a ledger updated after settlement cannot see an
    // in-flight spend, so two concurrent tool calls would each read a stale
    // total and jointly break a cap that each of them passed.
    expect(reserved.status).toBe("reserved");
  });

  it("hands back the same row for a repeated idempotency key", async () => {
    const ledger = memoryLedger();
    const first = await ledger.reserve(row("same", 10_000));

    const second = await ledger.reserve(row("same", 10_000));

    // The retry story: the SDK retries, a reconnect replays, a model that never
    // saw the result tries again. Without this each of those is a second payment.
    expect(second.id).toBe(first.id);
  });

  it("keeps different keys apart", async () => {
    const ledger = memoryLedger();
    const first = await ledger.reserve(row("one", 10_000));

    const second = await ledger.reserve(row("two", 10_000));

    expect(second.id).not.toBe(first.id);
  });

  it("counts reserved and settled spends against the window", async () => {
    const ledger = memoryLedger();
    const reserved = await ledger.reserve(row("a", 10_000));
    await ledger.settle(reserved.id, "settled");
    await ledger.reserve(row("b", 5000));

    const rows = await ledger.since(user, NOW - 1000);

    expect(rows).toHaveLength(2);
  });

  it("does not count a refusal against the window", async () => {
    const ledger = memoryLedger();
    const reserved = await ledger.reserve(row("a", 10_000));
    await ledger.settle(reserved.id, "refused");

    const rows = await ledger.since(user, NOW - 1000);

    // A refusal never consumed anything; counting it would let a rejected spend
    // eat the allowance it was denied.
    expect(rows).toEqual([]);
  });

  it("excludes spends older than the window", async () => {
    const ledger = memoryLedger();
    await ledger.reserve({ ...row("old", 10_000), at: NOW - 100_000 });

    expect(await ledger.since(user, NOW - 1000)).toEqual([]);
  });

  it("keeps one user's spend out of another's total", async () => {
    const ledger = memoryLedger();
    await ledger.reserve({
      ...row("other", 10_000),
      userId: userId("did:privy:someone-else"),
    });

    expect(await ledger.since(user, NOW - 1000)).toEqual([]);
  });

  it("serialises concurrent reservations of the same key", async () => {
    const ledger = memoryLedger();

    const [a, b] = await Promise.all([
      ledger.reserve(row("race", 10_000)),
      ledger.reserve(row("race", 10_000)),
    ]);

    // Two tool calls arriving together must not both win: the read-then-write
    // of the idempotency map has to be indivisible per user.
    expect(a.id).toBe(b.id);
  });
});
