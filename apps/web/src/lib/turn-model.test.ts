import { describe, expect, it } from "bun:test";

import {
  ReceiptId,
  TaskId,
  RunId,
  SessionId,
  SpendId,
  usdMicros,
} from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import type { ServiceTicket } from "@froggy/protocol";

import type { FroggyMessage } from "./stream-model";
import { groupParts, matchReceipts, turnCost } from "./turn-model";

const receipt = (at: number, toolCallId?: string): Receipt => {
  const base: Receipt = {
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
    runId: RunId.generate(),
    sessionId: SessionId.generate(),
    spendId: SpendId.generate(),
    stubbed: false,
  };
  return toolCallId === undefined ? base : { ...base, toolCallId };
};

const tool = (
  type: `tool-${string}`,
  toolCallId: string
): FroggyMessage["parts"][number] => ({
  input: {},
  output: "ok",
  state: "output-available",
  toolCallId,
  type,
});

const message: FroggyMessage = {
  id: "a1",
  parts: [
    tool("tool-browser_navigate", "b1"),
    tool("tool-x402_fetch", "c1"),
    tool("tool-wallet_send", "c2"),
  ],
  role: "assistant",
};

describe("matchReceipts", () => {
  it("files a receipt under the call it names", () => {
    const named = receipt(10, "c2");
    const { byCall, unclaimed } = matchReceipts(message, [named]);
    expect(byCall.get("c2")).toBe(named);
    expect(byCall.has("c1")).toBe(false);
    expect(unclaimed).toEqual([]);
  });

  it("gives an unnamed receipt to the first bare money call, in order", () => {
    const older = receipt(5);
    const named = receipt(10, "c1");
    const { byCall, unclaimed } = matchReceipts(message, [named, older]);
    // c1 is taken by name, so the unnamed one lands on c2, never on the browser call.
    expect(byCall.get("c1")).toBe(named);
    expect(byCall.get("c2")).toBe(older);
    expect(byCall.has("b1")).toBe(false);
    expect(unclaimed).toEqual([]);
  });

  it("leaves what no card claims under the turn, oldest first", () => {
    const elsewhere = receipt(20, "zz");
    const spare = receipt(1);
    const extra = receipt(2);
    const third = receipt(3);
    const { byCall, unclaimed } = matchReceipts(message, [
      third,
      elsewhere,
      spare,
      extra,
    ]);
    expect([...byCall.keys()].toSorted()).toEqual(["c1", "c2"]);
    expect(unclaimed.map((entry) => entry.at)).toEqual([3, 20]);
  });
});

describe("groupParts", () => {
  it("folds a run of page steps into one block, across step boundaries", () => {
    const turn: FroggyMessage = {
      id: "a2",
      parts: [
        { type: "step-start" },
        { text: "Let me look.", type: "text" },
        { type: "step-start" },
        tool("tool-browser_navigate", "b1"),
        { type: "step-start" },
        tool("tool-browser_snapshot", "b2"),
        { type: "step-start" },
        tool("tool-x402_fetch", "c1"),
        { type: "step-start" },
        { state: "streaming", text: "Paid.", type: "text" },
      ],
      role: "assistant",
    };
    const blocks = groupParts(turn);
    expect(blocks.map((block) => block.kind)).toEqual([
      "text",
      "step",
      "browse",
      "step",
      "tool",
      "step",
      "text",
    ]);
    const browse = blocks.at(2);
    expect(
      browse?.kind === "browse"
        ? browse.calls.map((call) => call.toolCallId)
        : []
    ).toEqual(["b1", "b2"]);
    const last = blocks.at(-1);
    expect(last?.kind === "text" ? last.live : null).toBe(true);
  });

  it("drops an empty thought and names a part it cannot read", () => {
    const turn: FroggyMessage = {
      id: "a3",
      parts: [
        { text: "   ", type: "reasoning" },
        { text: "why", type: "reasoning" },
        {
          input: {},
          state: "input-streaming",
          toolCallId: "d1",
          toolName: "mystery",
          type: "dynamic-tool",
        },
      ],
      role: "assistant",
    };
    const kinds = groupParts(turn).map((block) => block.kind);
    expect(kinds).toEqual(["reasoning", "tool"]);
  });
});

describe("turnCost", () => {
  it("is nothing when nothing was attempted", () => {
    expect(turnCost([])).toBeNull();
  });

  it("counts payments and refusals and sums only what settled", () => {
    const paid = {
      ...receipt(1),
      settlement: { network: "hedera:testnet", transactionId: "t" },
    };
    const refused: Receipt = {
      ...receipt(2),
      decision: { _tag: "deny", code: "frozen", message: "frozen" },
    };
    const unpaid: Receipt = {
      ...receipt(3),
      failure: "the seller answered 500",
    };
    expect(turnCost([paid, refused, unpaid])).toEqual({
      payments: 1,
      refusals: 2,
      usdMicros: 4000,
    });
  });
});

it("groups service polling by task within one turn while retaining every call and receipt", () => {
  const id = TaskId.generate();
  const ticket: ServiceTicket = {
    v: 1,
    id,
    runId: null,
    saleId: null,
    upstreamTransactionId: null,
    service: "image",
    prompt: "Fixture",
    status: "running",
    priceUsdMicros: usdMicros(1000),
    error: null,
    text: "",
    sources: [],
    stubbed: true,
    artifact: null,
  };
  const first: FroggyMessage["parts"][number] = {
    type: "tool-service_run",
    toolCallId: "purchase",
    state: "output-available",
    input: {},
    output: ticket,
  };
  const last: FroggyMessage["parts"][number] = {
    type: "tool-service_status",
    toolCallId: "poll",
    state: "output-available",
    input: {},
    output: { ...ticket, status: "done", text: "Ready" },
  };
  const turn: FroggyMessage = {
    id: "group-fixture",
    role: "assistant",
    parts: [first, { type: "text", text: "I am checking the result." }, last],
  };
  const blocks = groupParts(turn);
  expect(blocks.map((block) => block.kind)).toEqual(["service", "text"]);
  expect(
    blocks[0]?.kind === "service"
      ? blocks[0].calls.map((call) => call.toolCallId)
      : []
  ).toEqual(["purchase", "poll"]);
  const paid = receipt(1, "purchase");
  expect(matchReceipts(turn, [paid]).byCall.get("purchase")).toEqual(paid);
  expect(groupParts({ ...turn, id: "next-turn", parts: [last] })).toHaveLength(
    1
  );
});
