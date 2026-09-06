import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt, RunId as RunIdType } from "@froggy/domain";

import type { TimelineEvent } from "./app-state";
import { buildStream, lastBrowserTurn, showThinking } from "./stream-model";
import type { FroggyMessage, StreamItem } from "./stream-model";

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

/** The receipts filed on an item; a marker files none. */
const receiptsAt = (
  stream: readonly StreamItem[],
  index: number
): readonly number[] => {
  const item = stream[index];
  return item === undefined || item.kind === "marker"
    ? []
    : item.receipts.map((entry) => entry.at);
};

const event = (at: number): TimelineEvent => ({
  at,
  id: `e${at}`,
  kind: "frozen",
  text: "frozen",
});

const clocked = (id: string, at: number): FroggyMessage => ({
  id,
  metadata: { at },
  parts: [{ text: "hi", type: "text" }],
  role: "assistant",
});

const label = (item: StreamItem): string => {
  if (item.kind === "marker") {
    return `e${item.event.at}`;
  }
  return item.kind === "turn" ? item.message.id : "earlier";
};

describe("buildStream", () => {
  it("files each receipt under the turn that produced it, oldest first", () => {
    const runA = RunId.generate();
    const runB = RunId.generate();
    const stream = buildStream(
      [turn("m1", runA), turn("m2", runB)],
      [receipt(runB, 30), receipt(runA, 10), receipt(runA, 20)]
    );
    expect(stream.map((item) => item.kind)).toEqual(["turn", "turn"]);
    expect(receiptsAt(stream, 0)).toEqual([10, 20]);
    expect(receiptsAt(stream, 1)).toEqual([30]);
  });

  it("groups receipts with no turn on screen as earlier, once, at the top", () => {
    const orphan = RunId.generate();
    const stream = buildStream(
      [turn("m1", RunId.generate())],
      [receipt(orphan, 5), receipt(orphan, 2)]
    );
    expect(stream[0]).toMatchObject({ kind: "earlier" });
    expect(receiptsAt(stream, 0)).toEqual([2, 5]);
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

describe("showThinking", () => {
  const asked: FroggyMessage = {
    id: "u1",
    parts: [{ text: "hi", type: "text" }],
    role: "user",
  };

  it("shows the gap between sending and the first byte", () => {
    expect(showThinking([asked], "submitted")).toBe(true);
    expect(showThinking([asked], "streaming")).toBe(true);
  });

  it("shows nothing once words or a tool call are on screen", () => {
    expect(
      showThinking(
        [asked, turn("a1", undefined, [{ text: "Sure", type: "text" }])],
        "streaming"
      )
    ).toBe(false);
    expect(
      showThinking(
        [
          asked,
          turn("a1", undefined, [
            {
              input: {},
              state: "input-streaming",
              toolCallId: "c1",
              type: "tool-graph_query",
            },
          ]),
        ],
        "streaming"
      )
    ).toBe(false);
  });

  it("shows the gap between one step and the next", () => {
    expect(
      showThinking(
        [
          asked,
          turn("a1", undefined, [
            { text: "Sure", type: "text" },
            { type: "step-start" },
          ]),
        ],
        "streaming"
      )
    ).toBe(true);
  });

  it("shows nothing when the chat is idle or errored", () => {
    expect(showThinking([asked], "ready")).toBe(false);
    expect(showThinking([], "error")).toBe(false);
  });
});

describe("buildStream with events", () => {
  it("puts each event after the last message that started before it", () => {
    const stream = buildStream(
      [clocked("m1", 10), clocked("m2", 20), clocked("m3", 30)],
      [],
      [event(25), event(5), event(40)]
    );
    expect(stream.map(label)).toEqual(["e5", "m1", "m2", "e25", "m3", "e40"]);
  });

  it("keeps a message without a clock beside the one before it", () => {
    const draft: FroggyMessage = {
      id: "d",
      parts: [{ text: "x", type: "text" }],
      role: "user",
    };
    const stream = buildStream(
      [clocked("m1", 10), draft, clocked("m3", 30)],
      [],
      [event(15)]
    );
    expect(stream.map(label)).toEqual(["m1", "e15", "d", "m3"]);
  });
});
