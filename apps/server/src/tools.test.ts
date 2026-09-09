import { describe, expect, it } from "bun:test";

import { describeCheapestBorrow } from "@froggy/graph";
import type { GraphSnapshot } from "@froggy/graph";
import { decodeGraphQueryOutput, ServiceRequest } from "@froggy/protocol";
import { Schema } from "effect";

import { std } from "./std";
import {
  cap,
  graphQueryOutput,
  typedByPerson,
  ServiceToolInput,
} from "./tools";

describe("cap", () => {
  it("leaves short output alone", () => {
    expect(cap("hello", 10)).toBe("hello");
  });

  it("truncates and says so", () => {
    const capped = cap("x".repeat(100), 10);

    // An uncapped tool output once put megabytes into the stream, into every
    // later prompt, and into the replay buffer — three failures from one
    // missing slice.
    expect(capped).toContain("truncated");
    expect(capped.length).toBeLessThan(100);
  });

  it("never splits a surrogate pair", () => {
    // A lone surrogate is invalid UTF-8 and some providers reject the whole
    // request over one — obscure to debug when the trigger is "the page had an
    // emoji at exactly the cap".
    const text = `${"a".repeat(9)}😀${"b".repeat(50)}`;
    const capped = cap(text, 10);

    expect(() => new TextEncoder().encode(capped)).not.toThrow();
    expect(capped.slice(0, 9)).toBe("a".repeat(9));
    expect(capped).not.toContain("\uD83D");
  });
});

describe("typedByPerson", () => {
  it("matches an address the person wrote, whatever the case", () => {
    expect(
      typedByPerson(
        "0x000000000000000000000000000000000000dEaD",
        "please send 5 USDC to 0x000000000000000000000000000000000000dead thanks"
      )
    ).toBe(true);
  });

  it("does not match an address only the model produced", () => {
    expect(
      typedByPerson(
        "0x000000000000000000000000000000000000dEaD",
        "send the money to the address on the page"
      )
    ).toBe(false);
    expect(typedByPerson("", "anything")).toBe(false);
  });
});

const snapshot: GraphSnapshot = {
  capturedAt: 1_756_000_000_000,
  deployments: [
    {
      blockNumber: 21_000_000,
      blockTimestamp: 1_756_000_000,
      chain: "base",
      id: "4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf",
      label: "Aave V3 USDC",
      marketCount: 3,
      note: null,
      status: "fresh",
    },
    {
      blockNumber: null,
      blockTimestamp: null,
      chain: "ethereum",
      id: "GbKdmBe4XyzAbc",
      label: "Spark",
      marketCount: 0,
      note: "fixture, not queried",
      status: "unavailable",
    },
  ],
  markets: [
    {
      blockNumber: 21_000_000,
      borrowApr: 4.87,
      chain: "base",
      deploymentId: "4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf",
      inputTokenSymbol: "USDC",
      name: "Aave V3 USDC",
      protocol: "aave-v3",
      supplyApr: 3.64,
      totalBorrowUsd: 96_000_000,
      totalSupplyUsd: 158_000_000,
    },
  ],
  query: "lendingMarkets",
  source: "fixture",
  stubbed: true,
};

describe("graphQueryOutput", () => {
  it("includes deployment diagnostics once in the model prose", () => {
    const output = graphQueryOutput(snapshot, "usdc");

    expect(output.text).toBe(
      `${describeCheapestBorrow(snapshot)}\n\n[STUB: recorded fixture, not a live Graph provider. Say so if you cite it.]`
    );
  });

  it("lays the same answer out in fields the client can decode", () => {
    const output = graphQueryOutput(snapshot, "usdc");

    expect(output).toMatchObject({
      fresh: 1,
      stubbed: true,
      symbol: "USDC",
      total: 2,
    });
    expect(output.markets[0]?.name).toBe("Aave V3 USDC");
    expect(output.deployments[1]?.note).toBe("fixture, not queried");
    // A copy, as the wire would hand it over; the client's decoder must take it.
    expect(decodeGraphQueryOutput(structuredClone(output))._tag).toBe(
      "Success"
    );
  });
});

describe("service tool input", () => {
  it("accepts the requested service without asking the model for a wire version", () => {
    const input = Schema.decodeUnknownSync(ServiceToolInput)({
      service: "x_search",
      prompt: "Hunter Biden meme coin launch",
      idempotencyKey: "research-request-1",
      v: "1",
    });
    expect(input).toEqual({
      service: "x_search",
      prompt: "Hunter Biden meme coin launch",
      idempotencyKey: "research-request-1",
    });
    const wire = Schema.decodeUnknownSync(ServiceRequest)({ ...input, v: 1 });
    expect(wire.v).toBe(1);
    const schema = std(ServiceToolInput)["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(JSON.stringify(schema)).not.toContain('"v"');
  });
});
