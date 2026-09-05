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
  RunId,
  SessionId,
  SpendId,
  usdMicros,
  userId,
} from "@froggy/domain";
import type { ServiceModes } from "@froggy/protocol";
import type { SpendLedger } from "@froggy/wallet";

import { WorkspaceSession } from "./session";

const MODES: ServiceModes = {
  database: "live",
  graph: "stub",
  hedera: "stub",
  model: "stub",
  privy: "stub",
};

const ALICE = userId("did:privy:session-test");

/** Every read and write fails, the way an unreachable Postgres fails. */
const unreachable = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error("getaddrinfo ENOTFOUND postgres.railway.internal");
};

const brokenLedger = (): SpendLedger => ({
  reserve: unreachable,
  settle: unreachable,
  since: unreachable,
});

const noop = (): void => {
  // These tests read state rather than events.
};

const sessionWith = (ledger: SpendLedger): WorkspaceSession =>
  new WorkspaceSession(
    SessionId.generate(),
    ALICE,
    {
      ledger,
      modes: MODES,
      onPolicyDecision: noop,
      onReceipt: noop,
    },
    { hosts: ["froggy.test"], payeeIds: ["0.0.1"] }
  );

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

describe("a session that can read its ledger", () => {
  test("carries no note", async () => {
    const summary = await sessionWith({
      reserve: async (row) => {
        await Promise.resolve();
        return { ...row, status: "reserved" };
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
