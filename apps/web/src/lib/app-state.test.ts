import { describe, expect, it } from "bun:test";

import {
  ApprovalId,
  NoticeId,
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import type { ApprovalRequest, WalletSummary } from "@froggy/protocol";

import { initialAppState, reduceApp } from "./app-state";
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

const walletOf = (pocketUsdMicros: number | null): WalletSummary => ({
  address: null,
  agentNote: null,
  agentSigner: "absent",
  balanceLabel: "—",
  balances: {
    evmNetwork: "eip155:84532",
    hbarTinybars: null,
    hederaNetwork: "hedera:testnet",
    usdMicrosPerHbar: null,
    usdcUnits: null,
  },
  hederaAccountId: null,
  ledgerNote: null,
  pocketUsdMicros,
  signerAddress: null,
  totalUsdMicros: null,
  windowSpentUsdMicros: 0,
});

describe("timeline events", () => {
  it("files a conversion when the pocket grows, and nothing when it shrinks", () => {
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
      {
        kind: "topup",
        text: "Froggy moved $1.00 to Hedera for payments; $1.10 is ready there.",
      },
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

  it("names a schedule as where a turn came from", () => {
    const state = server(
      initialAppState,
      {
        runId: RunId.generate(),
        surface: "schedule",
        type: "run.started",
        v: 1,
      },
      7
    );
    expect(state.events[0]?.text).toContain("a schedule");
  });

  it("files a notice in the margin once, saying whether the phone saw it", () => {
    const notice = {
      at: 40,
      id: NoticeId.generate(),
      runId: null,
      scheduleId: null,
      source: "reminder" as const,
      telegram: true,
      text: "check the oven",
    };
    let state = server(initialAppState, { notice, type: "notice", v: 1 }, 41);
    state = server(state, { notice, type: "notice", v: 1 }, 42);
    expect(state.notices).toEqual([]);
    expect(state.events).toMatchObject([
      {
        at: 40,
        kind: "notice",
        text: "Reminder: check the oven (also sent to Telegram)",
      },
    ]);
  });
});

describe("the welcome", () => {
  it("keeps the topic and the policy the tickets link to", () => {
    const state = server(initialAppState, {
      agentSignerId: "quorum-test",
      hcsTopicId: "0.0.10381647",
      mcpUrl: null,
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
