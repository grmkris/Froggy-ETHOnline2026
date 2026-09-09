import { afterAll, describe, expect, test } from "bun:test";

import { userId } from "@froggy/domain";
import postgres from "postgres";

import { claimTradeStep } from "./trading-authority";
import { tradeFixture } from "./trading-fixture";
import { memoryTradingStore } from "./trading-store";
import type { TradingStore } from "./trading-store";
import { postgresTradingStore } from "./trading-store-postgres";

const refusal = async <T>(pending: Promise<T>): Promise<string | null> =>
  await pending.then(() => null, String);

const suite = (
  name: string,
  create: () => readonly [TradingStore, TradingStore]
): void => {
  describe(name, () => {
    test("concurrent reservations observe each other and remain owner scoped", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:trades-${crypto.randomUUID()}`);
      const reserve = async (store: TradingStore) =>
        await store.transact(owner, (book) => {
          const used = [...book.trades.values()].reduce(
            (sum, trade) => sum + BigInt(trade.input.amount),
            0n
          );
          if (used + 100n > 100n) {
            return false;
          }
          const trade = tradeFixture(crypto.randomUUID());
          book.trades.set(trade.id, {
            ...trade,
            reservationState: "held",
            reservations: [{ asset: trade.input.tokenIn, units: "100" }],
          });
          return true;
        });
      const outcomes = await Promise.all([reserve(first), reserve(second)]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(await second.transact(owner, (book) => book.trades.size)).toBe(1);
      expect(
        await second.transact(
          userId(`did:privy:stranger-${crypto.randomUUID()}`),
          (book) => book.trades.size
        )
      ).toBe(0);
    });

    test("EVM address case cannot split the wallet reservation book", async () => {
      const [store] = create();
      const owner = userId(`did:privy:case-${crypto.randomUUID()}`);
      const held = tradeFixture("held");
      const next = tradeFixture("next");
      const lower = `0x${"ab".repeat(20)}`;
      const upper = `0x${"AB".repeat(20)}`;
      const [step] = next.steps;
      if (step === undefined) {
        throw new Error("Missing fixture step");
      }
      await store.transact(owner, (book) => {
        book.trades.set(held.id, {
          ...held,
          input: { ...held.input, wallet: lower },
          reservationState: "held",
          reservations: [{ asset: held.input.tokenIn, units: "100" }],
        });
        book.trades.set(next.id, {
          ...next,
          input: { ...next.input, wallet: upper },
        });
      });
      const result = await store.transact(owner, (book) =>
        claimTradeStep(book, {
          id: next.id,
          stepId: step.id,
          authority: {
            kind: "human",
            approvalId: step.approvalId,
            fingerprint: step.fingerprint,
          },
          now: 10,
          frozen: false,
          balanceObservedAt: 1,
          balances: [
            { asset: next.input.tokenIn, units: "1000" },
            { asset: "native", units: "100" },
          ],
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("trade.pending");
      }
    });

    test("native principal and fees must fit the same available balance", async () => {
      const [store] = create();
      const owner = userId(`did:privy:native-${crypto.randomUUID()}`);
      const fixture = tradeFixture("native-budget");
      const trade = {
        ...fixture,
        input: { ...fixture.input, tokenIn: "native" as const },
      };
      const [step] = trade.steps;
      if (step === undefined) {
        throw new Error("Missing fixture step");
      }
      await store.transact(owner, (book) => {
        book.trades.set(trade.id, trade);
      });
      const reserve = async (units: string) =>
        await store.transact(owner, (book) =>
          claimTradeStep(book, {
            id: trade.id,
            stepId: step.id,
            authority: {
              kind: "human",
              approvalId: step.approvalId,
              fingerprint: step.fingerprint,
            },
            now: 10,
            frozen: false,
            balanceObservedAt: 1,
            balances: [{ asset: "native", units }],
          })
        );
      const insufficient = await reserve("105");
      expect(insufficient.ok).toBe(false);
      if (!insufficient.ok) {
        expect(insufficient.reason).toStartWith("trade.balance:");
      }
      const sufficient = await reserve("110");
      expect(sufficient.ok).toBe(true);
      if (sufficient.ok) {
        expect(sufficient.trade.reservations).toEqual([
          { asset: "native", units: "110" },
        ]);
      }
    });

    test("confirmed withdrawal proceeds cannot be allocated twice even after the first swap settles", async () => {
      const [store] = create();
      const owner = userId(`did:privy:proceeds-${crypto.randomUUID()}`);
      const source = tradeFixture("withdrawal");
      const first = {
        ...tradeFixture("proceeds-one"),
        sourceTradeId: source.id,
      };
      const second = {
        ...tradeFixture("proceeds-two"),
        sourceTradeId: source.id,
      };
      await store.transact(owner, (book) => {
        book.trades.set(source.id, {
          ...source,
          status: "completed",
          actualOutput: "100",
          input: {
            ...source.input,
            action: "withdraw",
            tokenOut: first.input.tokenIn,
          },
        });
        book.trades.set(first.id, first);
        book.trades.set(second.id, second);
      });
      const reserve = async (trade: typeof first) => {
        const [step] = trade.steps;
        if (step === undefined) {
          throw new Error("Missing step");
        }
        return await store.transact(owner, (book) =>
          claimTradeStep(book, {
            id: trade.id,
            stepId: step.id,
            authority: {
              kind: "human",
              approvalId: step.approvalId,
              fingerprint: step.fingerprint,
            },
            now: 10,
            frozen: false,
            balanceObservedAt: 1,
            balances: [
              { asset: trade.input.tokenIn, units: "1000" },
              { asset: "native", units: "1000" },
            ],
          })
        );
      };
      const reserved = await reserve(first);
      expect(reserved.ok).toBe(true);
      await store.transact(owner, (book) => {
        const current = book.trades.get(first.id);
        if (current === undefined) {
          throw new Error("Missing trade");
        }
        book.trades.set(first.id, {
          ...current,
          revision: current.revision + 1,
          status: "completed",
          reservationState: "released",
          steps: current.steps.map((step) => ({
            ...step,
            status: "confirmed",
          })),
        });
      });
      const denied = await reserve(second);
      expect(denied.ok).toBe(false);
      if (!denied.ok) {
        expect(denied.reason).toStartWith("trade.proceeds_reserved:");
      }
    });

    test("rolls back exceptions and rejects changing input under an old proposal", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:rollback-${crypto.randomUUID()}`);
      const trade = tradeFixture("one");
      expect(
        await refusal(
          first.transact(owner, (book) => {
            book.trades.set(trade.id, trade);
            throw new Error("interrupted");
          })
        )
      ).toContain("interrupted");
      expect(await second.transact(owner, (book) => book.trades.size)).toBe(0);
      await first.transact(owner, (book) => {
        book.trades.set(trade.id, trade);
      });
      expect(
        await refusal(
          second.transact(owner, (book) => {
            book.trades.set(trade.id, {
              ...trade,
              revision: 1,
              input: { ...trade.input, amount: "200" },
            });
          })
        )
      ).toContain("trade.immutable");
      expect(
        await first.transact(
          owner,
          (book) => book.trades.get(trade.id)?.input.amount
        )
      ).toBe("100");
      expect(
        await refusal(
          second.transact(owner, (book) => {
            book.trades.clear();
          })
        )
      ).toContain("trade.retention");
    });

    test("claims an exact approval once and never releases its hold on an ambiguous attempt", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:claim-${crypto.randomUUID()}`);
      const trade = tradeFixture("claim-once");
      const [step] = trade.steps;
      if (step === undefined) {
        throw new Error("Missing fixture step");
      }
      await first.transact(owner, (book) => {
        book.trades.set(trade.id, trade);
      });
      const request = {
        id: trade.id,
        stepId: step.id,
        authority: {
          kind: "human" as const,
          approvalId: step.approvalId,
          fingerprint: step.fingerprint,
        },
        now: 10,
        frozen: false,
        balances: [
          { asset: trade.input.tokenIn, units: "100" },
          { asset: "native" as const, units: "10" },
        ],
        balanceObservedAt: 1,
      };
      const wrong = await first.transact(owner, (book) =>
        claimTradeStep(book, {
          ...request,
          authority: { ...request.authority, fingerprint: "c".repeat(64) },
        })
      );
      expect(wrong.ok).toBe(false);
      const frozen = await first.transact(owner, (book) =>
        claimTradeStep(book, { ...request, frozen: true })
      );
      expect(frozen.ok).toBe(false);
      const stale = await first.transact(owner, (book) =>
        claimTradeStep(book, { ...request, now: 40_000 })
      );
      expect(stale.ok).toBe(false);
      const outcomes = await Promise.all([
        first.transact(owner, (book) => claimTradeStep(book, request)),
        second.transact(owner, (book) => claimTradeStep(book, request)),
      ]);
      expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
      const saved = await first.transact(owner, (book) =>
        book.trades.get(trade.id)
      );
      expect(saved?.reservationState).toBe("held");
      expect(saved?.steps[0]?.status).toBe("signing");
      expect(
        await refusal(
          second.transact(owner, (book) => {
            if (saved === undefined) {
              throw new Error("Missing saved trade");
            }
            book.trades.set(trade.id, {
              ...saved,
              revision: saved.revision + 1,
              steps: trade.steps,
            });
          })
        )
      ).toContain("trade.replay");
    });

    test("saved transaction identity cannot be replaced or settled steps reopened", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:immutable-${crypto.randomUUID()}`);
      const fixture = tradeFixture("signed-evidence");
      const trade = {
        ...fixture,
        steps: fixture.steps.map((step) => ({
          ...step,
          status: "signed" as const,
          authorizedAt: 10,
          signedPayload: "0x1234",
          transactionId: "0x5678",
        })),
      };
      await first.transact(owner, (book) => {
        book.trades.set(trade.id, trade);
      });
      await Promise.all(
        [
          { signedPayload: "0x9999" },
          { transactionId: "0x9999" },
          { authorizedAt: null },
        ].map(async (patch) => {
          expect(
            await refusal(
              second.transact(owner, (book) => {
                book.trades.set(trade.id, {
                  ...trade,
                  revision: 1,
                  steps: trade.steps.map((step) => ({ ...step, ...patch })),
                });
              })
            )
          ).toContain("trade.immutable");
        })
      );
      const settled = {
        ...trade,
        revision: 1,
        steps: trade.steps.map((step) => ({
          ...step,
          status: "confirmed" as const,
          confirmedAt: 20,
          actualNativeFee: "1",
        })),
      };
      await first.transact(owner, (book) => {
        book.trades.set(trade.id, settled);
      });
      expect(
        await refusal(
          second.transact(owner, (book) => {
            book.trades.set(trade.id, {
              ...settled,
              revision: 2,
              steps: settled.steps.map((step) => ({
                ...step,
                status: "submitted",
              })),
            });
          })
        )
      ).toContain("trade.settled");
    });

    test("retains uncertain signing records for recovery and prevents idempotency collisions", async () => {
      const [first, second] = create();
      const owner = userId(`did:privy:recover-${crypto.randomUUID()}`);
      const trade = tradeFixture("retry-me");
      await first.transact(owner, (book) => {
        book.trades.set(trade.id, { ...trade, status: "uncertain" });
      });
      expect(
        await refusal(
          second.transact(owner, (book) => {
            const duplicate = tradeFixture("retry-me");
            book.trades.set(duplicate.id, duplicate);
          })
        )
      ).toContain("trade.idempotency");
      expect(await second.pendingOwners()).toContain(owner);
    });
  });
};

suite("memory trade persistence", () => {
  const store = memoryTradingStore();
  return [store, store];
});
const url = process.env["FROGGY_TEST_DATABASE_URL"];
if (url === undefined) {
  test.skip("Postgres trade persistence requires FROGGY_TEST_DATABASE_URL", () => {});
} else {
  const first = postgres(url, { max: 5 });
  const second = postgres(url, { max: 5 });
  afterAll(async () => {
    await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
  });
  test("Postgres rejects a cross-owner record collision without overwriting the victim", async () => {
    const store = postgresTradingStore(first);
    const owner = userId(`did:privy:victim-${crypto.randomUUID()}`);
    const stranger = userId(`did:privy:collision-${crypto.randomUUID()}`);
    const trade = tradeFixture("owner-collision");
    await store.transact(owner, (book) => {
      book.trades.set(trade.id, trade);
    });
    expect(
      await refusal(
        store.transact(stranger, (book) => {
          book.trades.set(trade.id, { ...trade, status: "failed" });
        })
      )
    ).toContain("trade.owner");
    expect(
      await store.transact(owner, (book) => book.trades.get(trade.id)?.status)
    ).toBe(trade.status);
    expect(await store.transact(stranger, (book) => book.trades.size)).toBe(0);
  });
  suite("Postgres trade persistence", () => [
    postgresTradingStore(first),
    postgresTradingStore(second),
  ]);
}
