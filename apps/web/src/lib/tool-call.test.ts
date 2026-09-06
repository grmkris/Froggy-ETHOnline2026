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
    expect(summarize(call)).toMatchObject({
      headline: "image · quoted",
      outcome: "info",
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
