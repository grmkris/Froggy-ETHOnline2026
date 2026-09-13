import { describe, expect, it } from "bun:test";

import { TaskId, usdMicros } from "@froggy/domain";
import type { ServiceTicket } from "@froggy/protocol";

import { toolCallOf } from "./tool-call";
import { summarize } from "./tool-summary";

const ticket = (status: ServiceTicket["status"]): ServiceTicket => ({
  v: 1,
  id: TaskId.generate(),
  runId: null,
  saleId: null,
  upstreamTransactionId: null,
  service: "image",
  prompt: "A small frog",
  status,
  priceUsdMicros: usdMicros(120_000),
  error: null,
  text: status === "done" ? "Your image is ready." : "",
  sources: [],
  stubbed: true,
  artifact: null,
});

describe("service tool cards", () => {
  it("renders a structured purchase ticket without claiming the work finished", () => {
    const part = {
      type: "tool-service_run",
      state: "output-available",
      toolCallId: "service-1",
      input: { service: "image" },
      output: ticket("quoted"),
    };
    const call = toolCallOf(part);
    if (call === null) {
      throw new Error("Service tool output disappeared.");
    }
    expect(call.input.service).toBe("image");
    // Historical quoted states use a neutral task label without inventing payment settlement.
    expect(summarize(call)).toMatchObject({
      headline: "image · starting task",
      outcome: "info",
      detail: "Starting the task. The result will appear in Tools.",
      stubbed: true,
    });
  });
  it("renders completed results and explicit service refusals", () => {
    const part = {
      type: "tool-service_status",
      state: "output-available",
      toolCallId: "service-2",
      output: ticket("done"),
    };
    const call = toolCallOf(part);
    if (call === null) {
      throw new Error("Service result disappeared.");
    }
    expect(summarize(call)).toMatchObject({
      headline: "image · done",
      outcome: "ok",
      stubbed: true,
    });
    const refusedPart = {
      ...part,
      output: { v: 1, error: "Supplier is unavailable" },
    };
    const refused = toolCallOf(refusedPart);
    if (refused === null) {
      throw new Error("Service refusal disappeared.");
    }
    expect(summarize(refused)).toMatchObject({
      headline: "Service request refused",
      outcome: "refused",
      detail: "Supplier is unavailable",
    });
  });
});

describe("address lookup cards", () => {
  it("says what a pasted address is and whose it is, per network", () => {
    const part = {
      type: "tool-address_lookup",
      state: "output-available",
      toolCallId: "lookup-1",
      input: { address: "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2" },
      output: JSON.stringify({
        v: 1,
        operation: "address_lookup",
        provider: "froggy",
        stubbed: false,
        observedAt: 1_757_600_000_000,
        address: "0x8cc232c9eb25b4b20ee448106858e3b6281708c2",
        mine: [],
        networks: [
          {
            network: "eip155:8453",
            status: "observed",
            block: "0x1",
            kind: "eoa",
            nativeBalance: "1500000000000000",
            usdc: {
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              decimals: 6,
              units: "12500000",
            },
            token: null,
            note: "No contract code: a wallet (externally owned account), not a token.",
          },
          {
            network: "eip155:1",
            status: "unavailable",
            block: null,
            kind: null,
            nativeBalance: null,
            usdc: null,
            token: null,
            note: "RPC read failed.",
          },
        ],
        limitations: [],
      }),
    };
    const call = toolCallOf(part);
    if (call === null) {
      throw new Error("Address lookup output disappeared.");
    }
    expect(call.input.address).toBe(
      "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2"
    );
    expect(summarize(call)).toEqual({
      headline: "Wallet, not a token",
      outcome: "info",
      detail: "Base: wallet, 0.0015 native, 12.5 USDC · Ethereum: unavailable",
      stubbed: false,
    });
  });
});

describe("credit balance tool cards", () => {
  it("decodes a structured balance and preserves the simulated marker", () => {
    const part = {
      type: "tool-credits_balance",
      state: "output-available",
      toolCallId: "credits-1",
      input: {},
      output: {
        v: 1,
        availableUnits: 980_000,
        reservedUnits: 20_000,
        spentUnits: 0,
        limits: {
          perTaskUnits: 2_000_000,
          dailyUnits: 10_000_000,
          expiresAt: null,
          frozen: false,
        },
        stubbed: true,
      },
    };
    const call = toolCallOf(part);
    if (call === null) {
      throw new Error("Credit balance disappeared.");
    }
    expect(summarize(call)).toMatchObject({
      headline: "98 credits available",
      stubbed: true,
    });
    expect(summarize(call)?.detail).toContain("2 credits held");
  });
});
