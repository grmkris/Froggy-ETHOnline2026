import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";

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
