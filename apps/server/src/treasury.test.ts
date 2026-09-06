import { describe, expect, it } from "bun:test";

import type { HcsWriter, Payer, SettlementNote } from "@froggy/payments";
import { encodeSettlementHeader } from "@froggy/payments";

import { treasuryFetch } from "./treasury";

const GATEWAY = "https://gateway.example/x402/subgraphs/id/abc";

const challenge = {
  accepts: [
    {
      amount: "20000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: {},
      maxTimeoutSeconds: 300,
      network: "eip155:8453",
      payTo: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
      scheme: "exact",
    },
  ],
  x402Version: 2,
};

const payer = (header: string | null): Payer => ({
  accountId: "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2",
  mode: "live",
  network: "eip155:8453",
  pay: async (received) => {
    await Promise.resolve();
    const [requirement] = received.accepts;
    if (header === null) {
      return {
        error: "policy refused",
        header: null,
        requirements: null,
        stubbed: false,
      };
    }
    return {
      header,
      requirements: {
        amount: requirement?.amount ?? "0",
        asset: requirement?.asset ?? "",
        extra: {},
        maxTimeoutSeconds: 300,
        network: "eip155:8453",
        payTo: requirement?.payTo ?? "",
        scheme: "exact",
      },
      stubbed: false,
    };
  },
});

const notes = () => {
  const recorded: SettlementNote[] = [];
  const hcs: HcsWriter = {
    ensure: async () => await Promise.resolve("0.0.1"),
    mode: "stub",
    record: async (note) => {
      await Promise.resolve();
      recorded.push(note);
      return {
        sequenceNumber: recorded.length,
        topicId: "0.0.1",
        transactionId: "t",
      };
    },
    topicId: () => "0.0.1",
  };
  return { hcs, recorded };
};

/** A gateway that answers 402 until the payment header arrives. */
const gateway = () => {
  const seen: string[] = [];
  const answer = async (
    _input: URL | RequestInfo,
    init?: RequestInit
  ): Promise<Response> => {
    await Promise.resolve();
    const headers = new Headers(init?.headers);
    const payment = headers.get("x-payment");
    seen.push(payment ?? "(none)");
    if (payment === null) {
      return Response.json(challenge, { status: 402 });
    }
    return new Response('{"data":{"markets":[]}}', {
      headers: {
        "content-type": "application/json",
        "x-payment-response": encodeSettlementHeader({
          network: "eip155:8453",
          transactionId: "0xabc",
        }),
      },
      status: 200,
    });
  };
  // Bun's `fetch` carries `preconnect`; the fake needs the shape, not the behaviour.
  const fetchImpl: typeof fetch = Object.assign(answer, {
    preconnect: (): void => undefined,
  });
  return { fetch: fetchImpl, seen };
};

const outbound = (fetchImpl: typeof fetch) => ({
  fetch: fetchImpl,
  lookup: async () => await Promise.resolve(["93.184.216.34"]),
});

describe("treasuryFetch", () => {
  it("pays a 402 from the treasury, returns the answer and notes the settlement", async () => {
    const { fetch: fetchImpl, seen } = gateway();
    const { hcs, recorded } = notes();
    const response = await treasuryFetch(
      { hcs, outbound: outbound(fetchImpl), payer: payer("signed-header") },
      GATEWAY,
      {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("markets");
    expect(seen).toEqual(["(none)", "signed-header"]);
    expect(recorded).toMatchObject([
      {
        amount: "20000",
        kind: "paid",
        network: "eip155:8453",
        transactionId: "0xabc",
      },
    ]);
  });

  it("hands back a 402 with the reason when the treasury cannot pay", async () => {
    const { fetch: fetchImpl, seen } = gateway();
    const { hcs, recorded } = notes();
    const response = await treasuryFetch(
      { hcs, outbound: outbound(fetchImpl), payer: payer(null) },
      GATEWAY,
      { body: "{}", method: "POST" }
    );
    expect(response.status).toBe(402);
    expect(await response.text()).toContain("policy refused");
    expect(seen).toEqual(["(none)"]);
    expect(recorded).toEqual([]);
  });
});
