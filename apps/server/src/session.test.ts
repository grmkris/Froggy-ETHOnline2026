/**
 * The two things a session must never do.
 *
 * 1. Crash the process because a database was slow to provision. That is not
 *    hypothetical: it happened, on the deployed instance, and `/health` 502'd
 *    along with everything else because a fire-and-forget wallet publish
 *    rejected and Bun exits on an unhandled rejection.
 * 2. Report a full allowance when it cannot read the spend history. The
 *    display degrades; the *spending* still fails closed, which is the
 *    asymmetry these tests pin down.
 */

import { describe, expect, test } from "bun:test";

import {
  KNOWN_ASSETS,
  parQuote,
  RuleId,
  RunId,
  SessionId,
  SpendId,
  usd,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { ServiceModes } from "@froggy/protocol";
import { memoryLedger, memoryStore } from "@froggy/wallet";
import type { SpendLedger, Store } from "@froggy/wallet";

import type { ApprovalOutcome } from "./interactions";
import { MalformedSpendError, WorkspaceSession } from "./session";
import type { AskInput, SessionDeps, SpendRequest } from "./session";

const MODES: ServiceModes = {
  database: "live",
  graph: "stub",
  hedera: "stub",
  model: "stub",
  privy: "stub",
  telegram: "stub",
};

const ALICE = userId("did:privy:session-test");

/** Every read and write fails, the way an unreachable Postgres fails. */
const unreachable = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error("getaddrinfo ENOTFOUND postgres.railway.internal");
};

const brokenLedger = (): SpendLedger => ({
  refuse: unreachable,
  reserve: unreachable,
  settle: unreachable,
  since: unreachable,
});

const noop = (): void => {
  // These tests read state rather than events.
};

const sessionWith = (
  ledger: SpendLedger,
  store: Store = memoryStore(),
  ask?: (input: AskInput) => Promise<ApprovalOutcome>
): WorkspaceSession => {
  const deps: SessionDeps = {
    ledger,
    modes: MODES,
    onPolicyDecision: noop,
    onReceipt: noop,
    quote: (_asset, now) => parQuote(now),
    store,
  };
  return new WorkspaceSession(
    SessionId.generate(),
    ALICE,
    ask === undefined ? deps : { ...deps, ask },
    { hosts: ["froggy.test"], payeeIds: ["0.0.1"] }
  );
};

/** An asker that answers the same way every time and remembers what it was asked. */
const asker = (
  answer: (input: AskInput) => ApprovalOutcome | Promise<ApprovalOutcome>
) => {
  const asked: AskInput[] = [];
  const ask = async (input: AskInput): Promise<ApprovalOutcome> => {
    asked.push(input);
    return await answer(input);
  };
  return { ask, asked };
};

/** A payable request to the oracle, one HBAR-cent's worth unless overridden. */
const request = (
  overrides: Partial<SpendRequest> & {
    readonly key: string;
    readonly units?: string;
  }
): SpendRequest => ({
  amount: {
    asset: KNOWN_ASSETS["hedera:testnet:hbar"],
    units: overrides.units ?? "100000000",
  },
  idempotencyKey: overrides.key,
  payeeId: "0.0.1",
  payeeLabel: "the oracle",
  provenance: "server",
  purpose: "a snapshot",
  runId: RunId.generate(),
  settle: async () => {
    await Promise.resolve();
    return {
      network: "hedera:testnet",
      ok: true,
      stubbed: false,
      transactionId: `0.0.1@${overrides.key}`,
    };
  },
  ...overrides,
});

describe("walletSummary with an unreadable ledger", () => {
  test("resolves rather than rejecting", async () => {
    const summary = await sessionWith(brokenLedger()).walletSummary();

    expect(summary.windowSpentUsdMicros).toBe(0);
  });

  test("says the figure is not a total", async () => {
    const summary = await sessionWith(brokenLedger()).walletSummary();

    // Without this line, "$0 spent" reads as a full allowance rather than as
    // "we have no idea", which is the more dangerous of the two by far.
    expect(summary.ledgerNote).toContain("unavailable");
    expect(summary.ledgerNote).toContain("floor");
  });
});

describe("spending with an unreadable ledger", () => {
  test("fails closed", async () => {
    const session = sessionWith(brokenLedger());
    let settled = false;

    const attempt = session.spend({
      amount: { asset: KNOWN_ASSETS["hedera:testnet:hbar"], units: "1" },
      idempotencyKey: "k",
      payeeId: "0.0.1",
      payeeLabel: "the oracle",
      provenance: "server",
      purpose: "a snapshot",
      runId: RunId.generate(),
      settle: async () => {
        settled = true;
        await Promise.resolve();
        return {
          network: "hedera:mainnet",
          ok: true,
          stubbed: false,
          transactionId: "0.0.1@1",
        };
      },
    });

    // The display path degrades; this one must not. A cap that cannot be read
    // is a cap that has to be assumed reached.
    let refused: string | null = null;
    try {
      await attempt;
    } catch (error) {
      refused = error instanceof Error ? error.message : "unknown";
    }
    expect(refused).toContain("ENOTFOUND");
    expect(settled).toBe(false);
  });
});

describe("two tool calls with the same idempotency key", () => {
  test("settle exactly once", async () => {
    // The reproduced bug: both callers saw a row in state `reserved`, neither
    // could tell the other had written it, and both paid. "settle() ran 2
    // time(s)". Ownership, not status, is what has to be checked.
    const session = sessionWith(memoryLedger());
    let settlements = 0;

    const spend = async () =>
      await session.spend({
        amount: { asset: KNOWN_ASSETS["hedera:testnet:hbar"], units: "1" },
        idempotencyKey: "same-key",
        payeeId: "0.0.1",
        payeeLabel: "the oracle",
        provenance: "server",
        purpose: "a snapshot",
        runId: RunId.generate(),
        settle: async () => {
          settlements += 1;
          await Promise.resolve();
          return {
            network: "hedera:testnet",
            ok: true,
            stubbed: false,
            transactionId: `0.0.1@${settlements}`,
          };
        },
      });

    const [first, second] = await Promise.all([spend(), spend()]);

    expect(settlements).toBe(1);
    // And the loser still gets a truthful receipt: same transaction, because
    // it joined the winner's settlement rather than starting its own.
    expect(second.receipt.settlement?.transactionId).toBe(
      first.receipt.settlement?.transactionId
    );
  });

  test("a later retry does not pay again", async () => {
    const session = sessionWith(memoryLedger());
    let settlements = 0;

    const spend = async () =>
      await session.spend({
        amount: { asset: KNOWN_ASSETS["hedera:testnet:hbar"], units: "1" },
        idempotencyKey: "retried",
        payeeId: "0.0.1",
        payeeLabel: "the oracle",
        provenance: "server",
        purpose: "a snapshot",
        runId: RunId.generate(),
        settle: async () => {
          settlements += 1;
          await Promise.resolve();
          return {
            network: "hedera:testnet",
            ok: true,
            stubbed: false,
            transactionId: "0.0.1@1",
          };
        },
      });

    await spend();
    await spend();

    // The sequential case: the SDK retries, a reconnect replays, a model that
    // never saw the result tries again.
    expect(settlements).toBe(1);
  });
});

describe("a session that can read its ledger", () => {
  test("carries no note", async () => {
    const summary = await sessionWith({
      refuse: async () => {
        await Promise.resolve();
      },
      reserve: async (row) => {
        await Promise.resolve();
        return { created: true, row: { ...row, status: "reserved" } };
      },
      settle: async () => {
        await Promise.resolve();
      },
      since: async () => {
        await Promise.resolve();
        return [
          {
            at: Date.now(),
            id: SpendId.generate(),
            idempotencyKey: "a",
            status: "settled" as const,
            usdMicros: usdMicros(2500),
            userId: ALICE,
          },
        ];
      },
    }).walletSummary();

    expect(summary.ledgerNote).toBeNull();
    expect(summary.windowSpentUsdMicros).toBe(2500);
  });
});

describe("allowsHost", () => {
  const session = sessionWith(memoryLedger());

  test("allows a host the mandate lists", () => {
    expect(session.allowsHost("froggy.test")).toBe(true);
  });

  test("refuses anything else", () => {
    // The SSRF surface: `x402_fetch` used to send the request first and ask
    // the policy only once a 402 came back, so a prompt injection could aim
    // this server at a metadata endpoint or anything on the private network.
    expect(session.allowsHost("169.254.169.254")).toBe(false);
    expect(session.allowsHost("evil.example")).toBe(false);
  });

  test("refuses everything when there is no allowlist rule", () => {
    const bare = sessionWith(memoryLedger());
    bare.updateMandate({ ...bare.currentMandate, rules: [] });

    // "No rule" must read as "nothing is allowed". The other reading is how
    // an empty policy quietly becomes a permissive one.
    expect(bare.allowsHost("froggy.test")).toBe(false);
  });
});

describe("the lock around judgement and reservation", () => {
  test("two different spends cannot jointly exceed the rolling cap", async () => {
    // One rule: $10 per 24 hours at par. Two $6 spends racing used to both
    // read "$0 spent so far", both pass, and both reserve.
    const session = sessionWith(memoryLedger());
    session.updateMandate({
      ...session.currentMandate,
      rules: [
        {
          _tag: "window_cap",
          id: RuleId.generate(),
          maxUsdMicros: usd(10),
          windowMs: 24 * 60 * 60 * 1000,
        },
      ],
    });
    const six = "600000000";
    const [a, b] = await Promise.all([
      session.spend(request({ key: "a", units: six })),
      session.spend(request({ key: "b", units: six })),
    ]);
    const tags = [a.decision._tag, b.decision._tag].toSorted();
    expect(tags).toEqual(["allow", "deny"]);
    expect(
      [a, b].filter((r) => r.receipt.settlement !== undefined).length
    ).toBe(1);
  });

  test("a refusal is filed but never counts against the cap", async () => {
    const ledger = memoryLedger();
    const session = sessionWith(ledger);
    // Over the $2 per-transaction cap: refused before any reservation.
    const refused = await session.spend(
      request({ key: "big", units: "300000000" })
    );
    expect(refused.decision._tag).toBe("deny");
    const rows = await ledger.since(ALICE, 0);
    expect(rows.length).toBe(0);
    // And a retry with the same key after the fact is judged afresh, not
    // treated as a replay of the refusal.
    const small = await session.spend(
      request({ key: "big", units: "1000000" })
    );
    expect(small.decision._tag).toBe("allow");
  });
});

describe("what a malformed request gets", () => {
  test("is refused before the policy, as malformed rather than denied", async () => {
    const session = sessionWith(memoryLedger());
    let name = "none";
    try {
      await session.spend(request({ key: "neg", units: "-5" }));
    } catch (error) {
      name = error instanceof MalformedSpendError ? error.name : "other";
    }
    expect(name).toBe("MalformedSpendError");
  });
});

describe("a freeze between the reservation and the payment", () => {
  test("abandons the spend: nothing is sent and nothing counts", async () => {
    const inner = memoryLedger();
    let session: WorkspaceSession | null = null;
    // The freeze lands while the reservation is being written — the narrowest
    // window there is, and the one the last-look check exists for.
    const ledger: SpendLedger = {
      ...inner,
      reserve: async (row) => {
        session?.setFrozen(true);
        return await inner.reserve(row);
      },
    };
    session = sessionWith(ledger);
    let sent = false;
    const result = await session.spend(
      request({
        key: "frozen",
        settle: async () => {
          sent = true;
          await Promise.resolve();
          return {
            network: "hedera:testnet",
            ok: true,
            stubbed: false,
            transactionId: "never",
          };
        },
      })
    );
    expect(sent).toBe(false);
    expect(result.abandoned).toContain("frozen");
    expect(result.decision._tag).toBe("allow");
    expect(result.receipt.settlement).toBeUndefined();
    const counted = await inner.since(ALICE, 0);
    expect(counted.length).toBe(0);
  });
});

describe("hydration", () => {
  test("restores the frozen flag, the saved mandate and the receipts", async () => {
    const store = memoryStore();
    const first = sessionWith(memoryLedger(), store);
    await first.spend(request({ key: "before" }));
    first.setFrozen(true);
    const saved = first.updateMandate({ ...first.currentMandate, rules: [] });
    await Bun.sleep(5);

    const second = sessionWith(memoryLedger(), store);
    expect(second.currentMandate.frozen).toBe(false);
    await second.hydrate();
    expect(second.currentMandate.frozen).toBe(true);
    expect(second.currentMandate.rules).toEqual(saved.rules);
    expect(second.currentMandate.sessionId).toBe(second.id);
    expect(second.history.length).toBe(1);
    const recent = await second.recentReceipts();
    expect(recent.length).toBe(1);
  });
});

/**
 * The default mandate asks above $1 and caps a transaction at $2, so 1.5 HBAR
 * at par is the spend that is allowed by every cap and still wants a human.
 */
describe("a spend over the approval threshold", () => {
  const BIG = "150000000";

  const payingRequest = (key: string, sent: { count: number }) =>
    request({
      key,
      settle: async () => {
        sent.count += 1;
        await Promise.resolve();
        return {
          network: "hedera:testnet",
          ok: true,
          stubbed: false,
          transactionId: `0.0.1@${key}`,
        };
      },
      signal: new AbortController().signal,
      units: BIG,
    });

  test("is refused as unavailable when nobody can be asked", async () => {
    const session = sessionWith(memoryLedger());
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("nobody", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({
      _tag: "deny",
      code: "approval_unavailable",
    });
    expect(result.receipt.approval?.resolution).toBe("unavailable");
  });

  test("is refused as unavailable when the run says it is not interactive", async () => {
    const { ask, asked } = asker(() => ({
      accessToken: null,
      kind: "answered",
      optionId: "allow_once",
    }));
    const session = sessionWith(memoryLedger(), memoryStore(), ask);
    const sent = { count: 0 };
    const result = await session.spend({
      ...payingRequest("job", sent),
      interactive: false,
    });
    expect(asked.length).toBe(0);
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ code: "approval_unavailable" });
  });

  test("pays once when the person allows it once, and records the answer", async () => {
    const { ask, asked } = asker(() => ({
      accessToken: null,
      kind: "answered",
      optionId: "allow_once",
    }));
    const ledger = memoryLedger();
    const session = sessionWith(ledger, memoryStore(), ask);
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("once", sent));
    expect(asked.length).toBe(1);
    expect(asked[0]?.request.options.map((option) => option.kind)).toEqual([
      "deny_stop",
      "deny",
      "allow_session",
      "allow_once",
    ]);
    expect(sent.count).toBe(1);
    expect(result.decision._tag).toBe("allow");
    expect(result.receipt.approval).toMatchObject({ resolution: "allow_once" });
    expect(result.receipt.settlement?.transactionId).toBe("0.0.1@once");
    // Allowed once means once: the same spend again is asked again.
    await session.spend(payingRequest("again", sent));
    expect(asked.length).toBe(2);
  });

  test("writes an exemption when allowed for the session, and stops asking", async () => {
    const { ask, asked } = asker(() => ({
      accessToken: null,
      kind: "answered",
      optionId: "allow_session",
    }));
    const store = memoryStore();
    const session = sessionWith(memoryLedger(), store, ask);
    const sent = { count: 0 };
    await session.spend(payingRequest("first", sent));
    expect(asked.length).toBe(1);
    const exemption = session.currentMandate.rules.find(
      (rule) => rule._tag === "ask_exemption"
    );
    expect(exemption).toMatchObject({ payeeId: "0.0.1" });
    // Persisted with the mandate, so it survives a restart like any rule.
    const saved = await store.mandates.load(ALICE);
    expect(saved?.rules.some((rule) => rule._tag === "ask_exemption")).toBe(
      true
    );
    const second = await session.spend(payingRequest("second", sent));
    expect(asked.length).toBe(1);
    expect(second.decision._tag).toBe("allow");
    expect(second.receipt.approval).toBeUndefined();
    expect(sent.count).toBe(2);
  });

  test("files a refusal when the person says no, and pays nothing", async () => {
    const { ask } = asker(() => ({
      accessToken: null,
      kind: "answered",
      optionId: "deny",
    }));
    const ledger = memoryLedger();
    const session = sessionWith(ledger, memoryStore(), ask);
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("no", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({
      _tag: "deny",
      code: "approval_denied",
    });
    expect(result.receipt.approval?.resolution).toBe("deny");
    expect(result.receipt.settlement).toBeUndefined();
    // A refusal never counts against the window.
    const counted = await ledger.since(ALICE, 0);
    expect(counted.length).toBe(0);
  });

  test("treats silence as a refusal", async () => {
    const { ask } = asker(() => ({ kind: "deadline" }));
    const session = sessionWith(memoryLedger(), memoryStore(), ask);
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("late", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ code: "approval_timeout" });
    expect(result.receipt.approval?.resolution).toBe("timeout");
  });

  test("a wallet frozen while the card was open refuses, whatever the answer", async () => {
    let session: WorkspaceSession | null = null;
    const { ask } = asker(() => {
      session?.setFrozen(true);
      return { accessToken: null, kind: "answered", optionId: "allow_once" };
    });
    session = sessionWith(memoryLedger(), memoryStore(), ask);
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("frozen", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ _tag: "deny", code: "frozen" });
    expect(result.receipt.approval?.resolution).toBe("allow_once");
  });
});

describe("the pocket", () => {
  const pocketSession = (
    store: Store,
    startingUsdMicros: number
  ): WorkspaceSession =>
    new WorkspaceSession(
      SessionId.generate(),
      ALICE,
      {
        ledger: memoryLedger(),
        modes: MODES,
        onPolicyDecision: noop,
        onReceipt: noop,
        pocket: { networks: ["hedera:testnet"], startingUsdMicros },
        quote: (_asset, now) => parQuote(now),
        store,
      },
      { hosts: ["froggy.test"], payeeIds: ["0.0.1"] }
    );

  test("credits the starting allowance once, not once per session", async () => {
    const store = memoryStore();
    const first = pocketSession(store, 500_000);
    await first.hydrate();
    expect(first.pocket).toBe(500_000);
    await first.creditPocket(250_000);

    const second = pocketSession(store, 500_000);
    await second.hydrate();
    // The second session finds a pocket that exists and reads it; it does not
    // hand out lunch money again.
    expect(second.pocket).toBe(750_000);
  });

  test("draws the pocket down when a payment settles, and gives it back when one fails", async () => {
    const store = memoryStore();
    const session = pocketSession(store, 2_000_000);
    await session.hydrate();

    // One HBAR at par is one dollar.
    await session.spend(request({ key: "paid" }));
    expect(session.pocket).toBe(1_000_000);

    await session.spend(
      request({
        key: "failed",
        settle: async () => {
          await Promise.resolve();
          return {
            error: "the facilitator said no",
            network: "hedera:testnet",
            ok: false,
            stubbed: false,
            transactionId: null,
          };
        },
      })
    );
    expect(session.pocket).toBe(1_000_000);
    expect(await store.pocket.load(ALICE)).toBe(1_000_000);
  });

  test("refuses a payment the pocket cannot cover, before anything is sent", async () => {
    const session = pocketSession(memoryStore(), 500_000);
    await session.hydrate();
    let settled = false;

    const result = await session.spend(
      request({
        key: "too-much",
        settle: async () => {
          settled = true;
          await Promise.resolve();
          return {
            network: "hedera:testnet",
            ok: true,
            stubbed: false,
            transactionId: "0.0.1@x",
          };
        },
      })
    );

    expect(result.decision).toMatchObject({
      _tag: "deny",
      code: "pocket_exhausted",
    });
    expect(settled).toBe(false);
    expect(session.pocket).toBe(500_000);
  });

  test("a saved mandate still lists the server's own payees", async () => {
    const store = memoryStore();
    const first = pocketSession(store, 0);
    await first.hydrate();
    // The person edits their mandate, and the edit is what gets saved.
    first.updateMandate({
      ...first.currentMandate,
      rules: first.currentMandate.rules.map((rule) =>
        rule._tag === "payee_allowlist" ? { ...rule, payeeIds: [] } : rule
      ),
    });
    await Bun.sleep(1);

    const later = new WorkspaceSession(
      SessionId.generate(),
      ALICE,
      {
        ledger: memoryLedger(),
        modes: MODES,
        onPolicyDecision: noop,
        onReceipt: noop,
        quote: (_asset, now) => parQuote(now),
        store,
      },
      { hosts: ["froggy.test"], payeeIds: ["0.0.1", "0xtreasury"] }
    );
    await later.hydrate();
    const allowlist = later.currentMandate.rules.find(
      (rule) => rule._tag === "payee_allowlist"
    );
    expect(
      allowlist?._tag === "payee_allowlist" ? allowlist.payeeIds : []
    ).toEqual(["0.0.1", "0xtreasury"]);
  });
});
