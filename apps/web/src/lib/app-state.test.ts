import { describe, expect, it } from "bun:test";

import {
  ApprovalId,
  MandateId,
  ReceiptId,
  RuleId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Mandate, Receipt } from "@froggy/domain";
import type { ApprovalRequest, WalletSummary } from "@froggy/protocol";

import { bindingWindowCap, initialAppState, reduceApp } from "./app-state";
import type { AppEvent, AppState } from "./app-state";

const receipt = (at: number, id = ReceiptId.generate()): Receipt => ({
  at,
  decision: { _tag: "allow", satisfied: [] },
  id,
  intent: {
    amount: {
      asset: {
        decimals: 8,
        id: "0.0.0",
        network: "hedera:testnet",
        symbol: "HBAR",
      },
      units: "5000000",
    },
    idempotencyKey: `k-${at}`,
    payee: { id: "0.0.1", label: "the oracle", provenance: "server" },
    purpose: "a snapshot",
    usdMicros: usdMicros(4000),
  },
  quote: { asOf: at, source: "test", usdMicrosPerUnit: usdMicros(80_000) },
  runId: RunId.generate(),
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: false,
});

const card = (id: string): ApprovalRequest => ({
  amountLabel: "$1.50",
  detail: "Over the automatic limit.",
  expiresAt: 10_000,
  id,
  options: [{ id: "allow_once", kind: "allow_once", label: "Allow once" }],
  payeeLabel: "the oracle",
  purpose: "a snapshot",
  title: "Approve $1.50?",
});

const server = (
  state: AppState,
  message: Extract<AppEvent, { type: "server" }>["message"],
  at = 1
): AppState => reduceApp(state, { at, message, type: "server" });

describe("reduceApp", () => {
  it("keeps one copy of a receipt, newest first, whichever way it arrived", () => {
    const older = receipt(100);
    const newer = receipt(200);
    let state = server(initialAppState, {
      receipt: older,
      type: "receipt.appended",
      v: 1,
    });
    // The backfill carries the same receipt again, plus a newer one.
    state = reduceApp(state, { receipts: [older, newer], type: "receipts" });
    // And the socket replays it once more after a reconnect.
    state = server(state, { receipt: older, type: "receipt.appended", v: 1 });
    expect(state.receipts.map((entry) => entry.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("shows an approval card once and clears it when anyone answers", () => {
    let state = server(initialAppState, {
      request: card("apr_1"),
      type: "approval.request",
      v: 1,
    });
    state = server(state, {
      request: card("apr_1"),
      type: "approval.request",
      v: 1,
    });
    expect(state.approvals.length).toBe(1);
    state = server(state, {
      requestId: "apr_1",
      type: "approval.resolved",
      v: 1,
    });
    expect(state.approvals).toEqual([]);
  });

  it("says a protocol error out loud, and keeps only the last few", () => {
    let state = initialAppState;
    for (let index = 0; index < 5; index += 1) {
      state = server(
        state,
        {
          code: "decode_failed",
          message: `bad frame ${index}`,
          type: "protocol.error",
          v: 1,
        },
        index
      );
    }
    expect(state.notices.length).toBe(3);
    expect(state.notices[0]?.text).toBe("bad frame 4");
    state = reduceApp(state, {
      id: state.notices[0]?.id ?? "",
      type: "dismiss",
    });
    expect(state.notices.length).toBe(2);
  });
});

describe("bindingWindowCap", () => {
  it("picks the widest window, which is the one the pane's figure covers", () => {
    const cap = bindingWindowCap({
      createdAt: 0,
      frozen: false,
      id: MandateId.generate(),
      rules: [
        {
          _tag: "window_cap",
          id: RuleId.generate(),
          maxUsdMicros: usdMicros(5_000_000),
          windowMs: 3_600_000,
        },
        {
          _tag: "window_cap",
          id: RuleId.generate(),
          maxUsdMicros: usdMicros(10_000_000),
          windowMs: 86_400_000,
        },
      ],
      sessionId: SessionId.generate(),
    });
    expect(cap).toEqual({ maxUsdMicros: 10_000_000, windowMs: 86_400_000 });
    expect(bindingWindowCap(null)).toBeNull();
  });
});

const mandateOf = (frozen: boolean): Mandate => ({
  createdAt: 1,
  frozen,
  id: MandateId.generate(),
  rules: [],
  sessionId: SessionId.generate(),
});

const walletOf = (pocketUsdMicros: number | null): WalletSummary => ({
  address: null,
  agentNote: null,
  agentSigner: "absent",
  balanceLabel: "—",
  ledgerNote: null,
  pocketUsdMicros,
  signerAddress: null,
  windowSpentUsdMicros: 0,
});

describe("timeline events", () => {
  it("files a freeze and an unfreeze, but not the first mandate or a resend", () => {
    let state = server(
      initialAppState,
      { mandate: mandateOf(false), type: "mandate.state", v: 1 },
      10
    );
    expect(state.events).toEqual([]);
    state = server(
      state,
      { mandate: mandateOf(true), type: "mandate.state", v: 1 },
      20
    );
    expect(state.events.map((event) => event.kind)).toEqual(["frozen"]);
    // A reconnect resends the same state; that is not a second freeze.
    state = server(
      state,
      { mandate: mandateOf(true), type: "mandate.state", v: 1 },
      25
    );
    expect(state.events).toHaveLength(1);
    state = server(
      state,
      { mandate: mandateOf(false), type: "mandate.state", v: 1 },
      30
    );
    expect(state.events.map((event) => event.kind)).toEqual([
      "frozen",
      "unfrozen",
    ]);
    expect(state.events.at(-1)?.at).toBe(30);
  });

  it("files a top-up when the pocket grows, and nothing when it shrinks", () => {
    let state = server(
      initialAppState,
      { type: "wallet.state", v: 1, wallet: walletOf(100_000) },
      1
    );
    state = server(
      state,
      { type: "wallet.state", v: 1, wallet: walletOf(1_100_000) },
      2
    );
    expect(state.events).toMatchObject([
      { kind: "topup", text: "The pocket was topped up by $1.00, to $1.10." },
    ]);
    state = server(
      state,
      { type: "wallet.state", v: 1, wallet: walletOf(1_000_000) },
      3
    );
    expect(state.events).toHaveLength(1);
  });
});

const asking: ApprovalRequest = {
  amountLabel: "$1.50",
  detail: "Pay the oracle?",
  expiresAt: 10,
  id: "req-9",
  options: [],
  payeeLabel: "the oracle",
  purpose: "a snapshot",
  title: "Approve $1.50 to the oracle",
};

describe("timeline events for approvals and turns elsewhere", () => {
  it("marks the pause once, however many times the card is resent", () => {
    let state = server(
      initialAppState,
      { request: asking, type: "approval.request", v: 1 },
      5
    );
    state = server(
      state,
      { request: asking, type: "approval.request", v: 1 },
      6
    );
    expect(state.events.map((event) => event.kind)).toEqual(["asked"]);
    expect(state.events[0]?.text).toContain("waiting for your answer");
  });

  it("marks the answer from the receipt that carries it, once", () => {
    const answered: Receipt = {
      ...receipt(50),
      approval: { id: ApprovalId.generate(), resolution: "allow_once" },
    };
    let state = server(
      initialAppState,
      { receipt: answered, type: "receipt.appended", v: 1 },
      51
    );
    state = server(
      state,
      { receipt: answered, type: "receipt.appended", v: 1 },
      52
    );
    expect(state.events).toMatchObject([
      { at: 50, kind: "answered", text: "You answered: allowed once." },
    ]);
  });

  it("marks a turn started elsewhere in the conversation, not as a notice", () => {
    const state = server(
      initialAppState,
      {
        runId: RunId.generate(),
        surface: "telegram",
        type: "run.started",
        v: 1,
      },
      7
    );
    expect(state.notices).toEqual([]);
    expect(state.events).toMatchObject([{ kind: "elsewhere" }]);
    expect(state.events[0]?.text).toContain("Telegram");
    expect(
      server(
        state,
        { runId: RunId.generate(), surface: "web", type: "run.started", v: 1 },
        8
      ).events
    ).toHaveLength(1);
  });
});

describe("the welcome", () => {
  it("keeps the topic and the policy the tickets link to", () => {
    const state = server(initialAppState, {
      hcsTopicId: "0.0.10381647",
      modes: {
        database: "stub",
        graph: "stub",
        hedera: "stub",
        model: "stub",
        privy: "stub",
        telegram: "stub",
      },
      policyId: "rk6qw974uapbesb04u5tq5kb",
      sessionId: SessionId.generate(),
      type: "session.welcome",
      v: 1,
    });
    expect(state.hcsTopicId).toBe("0.0.10381647");
    expect(state.policyId).toBe("rk6qw974uapbesb04u5tq5kb");
  });
});
