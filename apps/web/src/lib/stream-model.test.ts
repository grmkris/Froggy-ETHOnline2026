import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt, RunId as RunIdType } from "@froggy/domain";

import { buildStream, lastBrowserTurn } from "./stream-model";
import type { FroggyMessage } from "./stream-model";

const receipt = (runId: RunIdType, at: number): Receipt => ({
  at,
  decision: { _tag: "allow", satisfied: [] },
  id: ReceiptId.generate(),
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
  runId,
  sessionId: SessionId.generate(),
  spendId: SpendId.generate(),
  stubbed: false,
});

const turn = (
  id: string,
  runId?: RunIdType,
  parts: FroggyMessage["parts"] = [{ text: "hi", type: "text" }]
): FroggyMessage => ({
  id,
  metadata: runId === undefined ? {} : { at: 1, runId },
  parts,
  role: "assistant",
});

describe("buildStream", () => {
  it("files each receipt under the turn that produced it, oldest first", () => {
    const runA = RunId.generate();
    const runB = RunId.generate();
    const stream = buildStream(
      [turn("m1", runA), turn("m2", runB)],
      [receipt(runB, 30), receipt(runA, 10), receipt(runA, 20)]
    );
    expect(stream.map((item) => item.kind)).toEqual(["turn", "turn"]);
    expect(stream[0]?.receipts.map((entry) => entry.at)).toEqual([10, 20]);
    expect(stream[1]?.receipts.map((entry) => entry.at)).toEqual([30]);
  });

  it("groups receipts with no turn on screen as earlier, once, at the top", () => {
    const orphan = RunId.generate();
    const stream = buildStream(
      [turn("m1", RunId.generate())],
      [receipt(orphan, 5), receipt(orphan, 2)]
    );
    expect(stream[0]).toMatchObject({ kind: "earlier" });
    expect(stream[0]?.receipts.map((entry) => entry.at)).toEqual([2, 5]);
    expect(stream.length).toBe(2);
  });

  it("finds the last turn that touched the page", () => {
    const browserTurn = turn("m2", RunId.generate(), [
      {
        input: { url: "https://example.com" },
        state: "output-available",
        toolCallId: "c1",
        type: "tool-browser_navigate",
        output: "ok",
      },
    ]);
    expect(lastBrowserTurn([turn("m1"), browserTurn, turn("m3")])).toBe("m2");
    expect(lastBrowserTurn([turn("m1")])).toBeNull();
  });
});
