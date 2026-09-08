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
import { MalformedSpendError, totalOf, WorkspaceSession } from "./session";
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

/** The deployment that keeps caps and a threshold: what the approval tests need. */
const LIMITED: Partial<SessionDeps> = { spendingLimits: true };

const sessionWith = (
  ledger: SpendLedger,
  store: Store = memoryStore(),
  ask?: (input: AskInput) => Promise<ApprovalOutcome>,
  extra: Partial<SessionDeps> = {}
): WorkspaceSession => {
  const deps: SessionDeps = {
    ...extra,
    ledger,
    modes: MODES,
    onPolicyDecision: noop,
    balances: {
      hbar: async () => await Promise.resolve(null),
      usdc: async () => await Promise.resolve(null),
    },
    networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
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

describe("the one balance", () => {
  const parts = {
    hbarTinybars: 100_000_000n,
    hederaAccountId: "0.0.42",
    usdMicrosPerHbar: 80_000,
    usdcUnits: 1_000_000n,
  };

  test("adds USDC to HBAR at the rate", () => {
    expect(totalOf(parts)).toBe(1_080_000);
  });

  test("is unknown when the USDC balance is", () => {
    expect(totalOf({ ...parts, usdcUnits: null })).toBeNull();
  });

  test("is unknown when an account exists but its HBAR or the rate does not", () => {
    expect(totalOf({ ...parts, hbarTinybars: null })).toBeNull();
    expect(totalOf({ ...parts, usdMicrosPerHbar: null })).toBeNull();
  });

  test("counts no Hedera account as a known zero", () => {
    expect(
      totalOf({ ...parts, hbarTinybars: null, hederaAccountId: null })
    ).toBe(1_000_000);
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
    const session = sessionWith(memoryLedger(), undefined, undefined, LIMITED);
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
    const session = sessionWith(ledger, undefined, undefined, LIMITED);
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

/** A $2 per-transaction cap, the rule a deployment without limits strips. */
const cap = () => ({
  _tag: "per_tx_cap" as const,
  id: RuleId.generate(),
  maxUsdMicros: usd(2),
});

describe("spending limits", () => {
  test("a new mandate is allowlists only", () => {
    const tags = sessionWith(memoryLedger()).currentMandate.rules.map(
      (rule) => rule._tag
    );
    expect(tags).toEqual([
      "payee_allowlist",
      "host_allowlist",
      "network_allowlist",
    ]);
  });

  test("a deployment that keeps them starts with the seven rules", () => {
    const tags = sessionWith(
      memoryLedger(),
      undefined,
      undefined,
      LIMITED
    ).currentMandate.rules.map((rule) => rule._tag);
    expect(tags).toContain("per_tx_cap");
    expect(tags).toContain("approval_threshold");
    expect(tags).toHaveLength(7);
  });

  test("a posted cap is stripped on the way in", () => {
    const session = sessionWith(memoryLedger());
    const next = session.updateMandate({
      ...session.currentMandate,
      rules: [...session.currentMandate.rules, cap()],
    });
    expect(next.rules.some((rule) => rule._tag === "per_tx_cap")).toBe(false);
  });

  test("a saved cap is stripped on load, republished and rewritten", async () => {
    const store = memoryStore();
    const first = sessionWith(memoryLedger(), store);
    await store.mandates.save(ALICE, {
      ...first.currentMandate,
      rules: [...first.currentMandate.rules, cap()],
    });
    const published: string[][] = [];
    const session = sessionWith(memoryLedger(), store, undefined, {
      onMandate: (mandate) => {
        published.push(mandate.rules.map((rule) => rule._tag));
      },
    });
    await session.hydrate();
    expect(
      session.currentMandate.rules.some((rule) => rule._tag === "per_tx_cap")
    ).toBe(false);
    expect(published.at(-1)).not.toContain("per_tx_cap");
    const saved = await store.mandates.load(ALICE);
    expect(saved?.rules.some((rule) => rule._tag === "per_tx_cap")).toBe(false);
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
    const session = sessionWith(memoryLedger(), undefined, undefined, LIMITED);
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
    const session = sessionWith(memoryLedger(), memoryStore(), ask, LIMITED);
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
    const session = sessionWith(ledger, memoryStore(), ask, LIMITED);
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
    const session = sessionWith(memoryLedger(), store, ask, LIMITED);
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
    const session = sessionWith(ledger, memoryStore(), ask, LIMITED);
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
    const session = sessionWith(memoryLedger(), memoryStore(), ask, LIMITED);
    const sent = { count: 0 };
    const result = await session.spend(payingRequest("late", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ code: "approval_timeout" });
    expect(result.receipt.approval?.resolution).toBe("timeout");
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
        balances: {
          hbar: async () => await Promise.resolve(null),
          usdc: async () => await Promise.resolve(null),
        },
        networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
        onReceipt: noop,
        pocket: {
          networks: ["hedera:testnet"],
          startingUsdMicrosFor: () => startingUsdMicros,
        },
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

  test("draws the pocket down when a payment settles, and gives it back when nothing was sent", async () => {
    const store = memoryStore();
    const session = pocketSession(store, 2_000_000);
    await session.hydrate();

    // One HBAR at par is one dollar.
    await session.spend(request({ key: "paid" }));
    expect(session.pocket).toBe(1_000_000);

    // The signer refused: the header never left, so the draw comes back and
    // the row is abandoned rather than failed.
    const refused = await session.spend(
      request({
        key: "refused-by-signer",
        settle: async () => {
          await Promise.resolve();
          return {
            error: "the facilitator said no",
            network: "hedera:testnet",
            ok: false,
            sent: false,
            stubbed: false,
            transactionId: null,
          };
        },
      })
    );
    expect(refused.receipt.failure).toBe("the facilitator said no");
    expect(session.pocket).toBe(1_000_000);
    expect(await store.pocket.load(ALICE)).toBe(1_000_000);
  });

  test("keeps the draw when a sent payment is not confirmed either way, and gives it back only when the network says it failed", async () => {
    const store = memoryStore();
    const session = pocketSession(store, 3_000_000);
    await session.hydrate();

    const failedAfterSend = (
      verdict: "failed" | "success" | "unknown",
      key: string
    ) =>
      request({
        key,
        reconcile: async () => await Promise.resolve(verdict),
        settle: async () => {
          await Promise.resolve();
          return {
            error: "the seller answered 502",
            network: "hedera:testnet",
            ok: false,
            sent: true,
            stubbed: false,
            transactionId: "0.0.1@42",
          };
        },
      });

    // Nobody knows: the dollar stays reserved and the receipt says so.
    const unknown = await session.spend(failedAfterSend("unknown", "unknown"));
    expect(session.pocket).toBe(2_000_000);
    expect(unknown.receipt.failure).toContain("not yet known");

    // The mirror node says it landed: paid, and the receipt keeps the seller's error.
    const landed = await session.spend(failedAfterSend("success", "landed"));
    expect(session.pocket).toBe(1_000_000);
    expect(landed.receipt.failure).toBe("paid, but the seller answered 502");
    expect(landed.receipt.settlement?.transactionId).toBe("0.0.1@42");

    // The mirror node says it did not: the draw comes back.
    await session.spend(failedAfterSend("failed", "bounced"));
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
        balances: {
          hbar: async () => await Promise.resolve(null),
          usdc: async () => await Promise.resolve(null),
        },
        networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
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

describe("converting USDC when the pocket is short", () => {
  const TREASURY = "0xtreasury";
  const USDC = KNOWN_ASSETS["eip155:84532:usdc"];
  type Convert = NonNullable<SessionDeps["convert"]>;

  /** A session with a pocket, a granted signer and a recording converter. */
  const converting = (
    store: Store,
    starting: number,
    options: {
      readonly funded?: Parameters<Convert["perform"]>[0] extends never
        ? never
        : Awaited<ReturnType<Convert["perform"]>>["funded"];
      readonly held?: bigint | null;
      readonly transferOk?: boolean;
    } = {}
  ) => {
    const performed: number[] = [];
    const perform: Convert["perform"] = async (_userId, _wallet, amount) => {
      performed.push(amount);
      await Promise.resolve();
      const transfer =
        options.transferOk === false
          ? {
              error: "Privy: policy refused the transfer",
              network: "eip155:84532",
              ok: false,
              stubbed: false,
              transactionId: null,
            }
          : {
              network: "eip155:84532",
              ok: true,
              stubbed: false,
              transactionId: `0xconvert${performed.length}`,
            };
      return {
        funded:
          options.transferOk === false
            ? null
            : (options.funded ?? { note: "1.0000 HBAR moved (0.0.1@x)" }),
        transfer,
      };
    };
    const session = new WorkspaceSession(
      SessionId.generate(),
      ALICE,
      {
        balances: {
          hbar: async () => await Promise.resolve(null),
          usdc: async () => await Promise.resolve(options.held ?? null),
        },
        convert: {
          asset: USDC,
          payeeId: TREASURY,
          payeeLabel: "the treasury",
          perform,
        },
        ledger: memoryLedger(),
        modes: MODES,
        networks: { evm: "eip155:84532", hedera: "hedera:testnet" },
        onPolicyDecision: noop,
        onReceipt: noop,
        pocket: {
          networks: ["hedera:testnet"],
          startingUsdMicrosFor: () => starting,
        },
        quote: (_asset, now) => parQuote(now),
        store,
      },
      { hosts: ["froggy.test"], payeeIds: ["0.0.1", TREASURY] }
    );
    session.setWallet({ address: "0xalice", id: "wallet-alice" });
    session.setAgentSigner("granted", null);
    return { performed, session };
  };

  const paying = (key: string, units: string, sent: { count: number }) =>
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
      units,
    });

  test("buys at least two dollars of HBAR, then pays, and both are on the receipts", async () => {
    const { performed, session } = converting(memoryStore(), 500_000);
    await session.hydrate();
    const sent = { count: 0 };
    // 1.00 HBAR at par; the pocket holds 0.50.
    const result = await session.spend(paying("short", "100000000", sent));
    expect(performed).toEqual([1_500_000]);
    expect(sent.count).toBe(1);
    expect(result.decision._tag).toBe("allow");
    expect(session.pocket).toBe(1_000_000);
    const keys = session.history.map(
      (receipt) => receipt.intent.idempotencyKey
    );
    expect(keys).toEqual(["convert:short", "short"]);
    expect(session.history[0]?.settlement?.note).toContain("HBAR moved");
  });

  test("converts twice the price for a bigger payment, bounded by the USDC held", async () => {
    const { performed, session } = converting(memoryStore(), 0, {
      held: 4_000_000n,
    });
    await session.hydrate();
    const sent = { count: 0 };
    // 3.00 HBAR at par: the target is 6.00, the wallet holds 4.00.
    const result = await session.spend(paying("big", "300000000", sent));
    expect(performed).toEqual([4_000_000]);
    expect(result.decision._tag).toBe("allow");
    expect(sent.count).toBe(1);
  });

  test("refuses without sending when the USDC held cannot cover the shortfall", async () => {
    const { performed, session } = converting(memoryStore(), 0, {
      held: 2_000_000n,
    });
    await session.hydrate();
    const sent = { count: 0 };
    const result = await session.spend(paying("toobig", "300000000", sent));
    expect(performed).toEqual([]);
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({
      _tag: "deny",
      code: "conversion_failed",
    });
    expect(
      result.decision._tag === "deny" ? result.decision.message : ""
    ).toContain("Add funds");
  });

  test("refuses when the signer refuses the USDC leg, quoting it", async () => {
    const { session } = converting(memoryStore(), 0, { transferOk: false });
    await session.hydrate();
    const sent = { count: 0 };
    const result = await session.spend(paying("refused", "100000000", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ code: "conversion_failed" });
    expect(
      result.decision._tag === "deny" ? result.decision.message : ""
    ).toContain("Privy: policy refused");
    expect(session.history[0]?.failure).toContain("Privy: policy refused");
    expect(session.pocket).toBe(0);
  });

  test("keeps unconfirmed HBAR out of spendable credit", async () => {
    const { session } = converting(memoryStore(), 0, {
      funded: { error: "the mirror node timed out" },
    });
    await session.hydrate();
    const sent = { count: 0 };
    const result = await session.spend(paying("late", "100000000", sent));
    expect(sent.count).toBe(0);
    expect(result.decision).toMatchObject({ code: "conversion_failed" });
    expect(
      result.decision._tag === "deny" ? result.decision.message : ""
    ).toContain("Pending funds cannot be spent");
    expect(session.pocket).toBe(0);
  });

  test("two short spends at once share one conversion", async () => {
    const { performed, session } = converting(memoryStore(), 0);
    await session.hydrate();
    const sent = { count: 0 };
    const [a, b] = await Promise.all([
      session.spend(paying("one", "50000000", sent)),
      session.spend(paying("two", "50000000", sent)),
    ]);
    expect(performed).toEqual([2_000_000]);
    expect([a.decision._tag, b.decision._tag]).toEqual(["allow", "allow"]);
    expect(sent.count).toBe(2);
  });

  test("still converts for a job nobody is watching", async () => {
    const { performed, session } = converting(memoryStore(), 0);
    await session.hydrate();
    const sent = { count: 0 };
    const result = await session.spend({
      ...paying("job", "100000000", sent),
      interactive: false,
    });
    expect(performed).toEqual([2_000_000]);
    expect(result.decision._tag).toBe("allow");
  });

  test("refuses when the agent has no signer, and says so", async () => {
    const { performed, session } = converting(memoryStore(), 0);
    session.setAgentSigner("absent", "Privy said no");
    await session.hydrate();
    const sent = { count: 0 };
    const result = await session.spend(paying("nosigner", "100000000", sent));
    expect(performed).toEqual([]);
    expect(result.decision).toMatchObject({ code: "conversion_failed" });
    expect(
      result.decision._tag === "deny" ? result.decision.message : ""
    ).toContain("Privy said no");
  });
  test("a disallowed parent never converts USDC", async () => {
    const { performed, session } = converting(memoryStore(), 0);
    await session.hydrate();
    const result = await session.spend(
      request({ key: "wrong-payee", payeeId: "0.0.999" })
    );
    expect(result.decision).toMatchObject({ code: "payee_not_allowed" });
    expect(performed).toEqual([]);
  });
  test("the same parent key can pay after pending funding is recovered", async () => {
    const store = memoryStore();
    const { performed, session } = converting(store, 0, {
      funded: { error: "HBAR confirmation pending" },
    });
    await session.hydrate();
    const sent = { count: 0 };
    const payment = paying("recover-parent", "100000000", sent);
    const first = await session.spend(payment);
    expect(first.decision).toMatchObject({ code: "conversion_failed" });
    expect(sent.count).toBe(0);
    // The durable coordinator's credit is independent of the parent request.
    await store.pocket.adjust(ALICE, 2_000_000);
    const retried = await session.spend(payment);
    expect(retried.decision._tag).toBe("allow");
    expect(sent.count).toBe(1);
    expect(performed).toEqual([2_000_000]);
    expect(session.pocket).toBe(1_000_000);
  });
  test("an over-budget parent never converts USDC", async () => {
    const { performed, session } = converting(memoryStore(), 0);
    await session.hydrate();
    const result = await session.spend({
      ...request({ key: "over-budget" }),
      budgetUsdMicros: 250_000,
    });
    expect(result.decision).toMatchObject({ code: "run_budget_exceeded" });
    expect(performed).toEqual([]);
  });
});

describe("the receipt names the tool call that spent", () => {
  test("carries the call id through an allow and through a refusal", async () => {
    const session = sessionWith(memoryLedger(), undefined, undefined, LIMITED);

    const paid = await session.spend(
      request({ key: "paid", toolCallId: "call-1" })
    );
    expect(paid.receipt.toolCallId).toBe("call-1");

    // Over the $2 per-transaction cap: refused, and still filed under the call.
    const refused = await session.spend(
      request({ key: "big", toolCallId: "call-2", units: "300000000" })
    );
    expect(refused.decision._tag).toBe("deny");
    expect(refused.receipt.toolCallId).toBe("call-2");
  });

  test("has none when no tool made the spend", async () => {
    const paid = await sessionWith(memoryLedger()).spend(
      request({ key: "job" })
    );

    // Absent, not present-and-undefined: the receipt is a stored document.
    expect("toolCallId" in paid.receipt).toBe(false);
  });
});
