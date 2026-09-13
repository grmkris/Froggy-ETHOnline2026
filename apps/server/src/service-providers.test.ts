import { beforeAll, describe, expect, it } from "bun:test";

import { KNOWN_ASSETS } from "@froggy/domain";
import { encodeSettlementHeader } from "@froggy/payments";
import type { PaymentChallenge } from "@froggy/payments";
import { Effect, Redacted } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { boundedBytes } from "./outbound";
import { resumeServiceProvider, runServiceProvider } from "./service-providers";
import { createServices } from "./services";

let environment: Environment;
beforeAll(async () => {
  Object.assign(process.env, {
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
    SERVICE_SUPPLIER_PAYEES: "",
    X_API_BEARER_TOKEN: "",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
// Test-only addresses, never used to configure a live payment.
const PAYEE = "0x1111111111111111111111111111111111111111";
const offer = (amount = "5000", payTo = PAYEE): PaymentChallenge => ({
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: KNOWN_ASSETS["eip155:8453:usdc"].id,
      amount,
      payTo,
      maxTimeoutSeconds: 300,
    },
  ],
});
const fixture = (answers: readonly Response[]) => {
  const requests: { url: string; payment: string | null }[] = [];
  let signatures = 0;
  const fetchImpl: typeof fetch = Object.assign(
    async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      await Promise.resolve();
      requests.push({
        url: input instanceof Request ? input.url : String(input),
        payment: new Headers(init?.headers).get("payment-signature"),
      });
      const response = answers[requests.length - 1];
      if (!response) {
        throw new Error("Unexpected extra request.");
      }
      return response;
    },
    { preconnect: (): void => undefined }
  );
  const stub = createServices({ environment });
  const services = {
    ...stub,
    environment: {
      ...environment,
      modes: { ...environment.modes, hedera: "live" as const },
      xApiBearer: Redacted.make("test-only-bearer"),
      supplierPayees: { "api.you.com": PAYEE, "blockrun.ai": PAYEE },
    },
    treasuryPayer: {
      accountId: PAYEE,
      mode: "live" as const,
      network: "eip155:8453",
      pay: async (challenge: PaymentChallenge) => {
        await Promise.resolve();
        signatures += 1;
        const [requirements] = challenge.accepts;
        return {
          header: "test-proof",
          requirements: requirements
            ? {
                ...requirements,
                extra: requirements.extra ?? {},
                network: "eip155:8453" as const,
                maxTimeoutSeconds: 300,
              }
            : null,
          stubbed: false,
        };
      },
    },
  };
  return {
    services,
    requests,
    signatures: () => signatures,
    outbound: {
      fetch: fetchImpl,
      lookup: async () => await Promise.resolve(["93.184.216.34"]),
    },
  };
};
const input = {
  v: 2 as const,
  service: "web_search" as const,
  prompt: "train tickets",
  idempotencyKey: "provider-test",
};

const rejectsWith = async <T>(
  promise: Promise<T>,
  message: string
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(
      message
    );
    return;
  }
  throw new Error(`Expected rejection containing ${message}`);
};

describe("service providers", () => {
  it("rejects an expensive or substituted payee quote before signing", async () => {
    await Promise.all(
      [
        offer("10001"),
        offer("5000", "0x2222222222222222222222222222222222222222"),
      ].map(async (quote) => {
        const setup = fixture([Response.json(quote, { status: 402 })]);
        await rejectsWith(
          runServiceProvider(setup.services, input, setup.outbound),
          "quote refused"
        );
        expect(setup.signatures()).toBe(0);
        expect(setup.requests).toHaveLength(1);
      })
    );
  });
  it("pays once and preserves citations and the upstream settlement", async () => {
    const setup = fixture([
      Response.json(offer(), { status: 402 }),
      Response.json(
        {
          results: {
            web: [
              {
                title: "Rail fares",
                url: "https://rail.example/fares",
                description: "Compare fares",
              },
            ],
          },
        },
        {
          headers: {
            "payment-response": encodeSettlementHeader({
              network: "eip155:8453",
              transactionId: "0xtest",
            }),
          },
        }
      ),
    ]);
    const result = await runServiceProvider(
      setup.services,
      input,
      setup.outbound
    );
    expect(result.stubbed).toBe(false);
    expect(result.sources[0]?.url).toBe("https://rail.example/fares");
    expect(result.upstreamTransactionId).toBe("0xtest");
    expect(setup.requests.map((entry) => entry.payment)).toEqual([
      null,
      "test-proof",
    ]);
    expect(setup.signatures()).toBe(1);
  });
  it("never retries a paid supplier failure", async () => {
    const setup = fixture([
      Response.json(offer(), { status: 402 }),
      new Response("failure", { status: 502 }),
    ]);
    await rejectsWith(
      runServiceProvider(setup.services, input, setup.outbound),
      "502"
    );
    expect(setup.signatures()).toBe(1);
    expect(setup.requests).toHaveLength(2);
  });
  it("records a capped, header-free excerpt of a paid 4xx so the failure can be diagnosed", async () => {
    // The production web search that looked stuck had been answered 422 on
    // its paid retry; the row said "422" and nothing else.
    const body = `{"detail":"payment header invalid\\n\\ttoken=secret"}${"x".repeat(500)}`;
    const setup = fixture([
      Response.json(offer(), { status: 402 }),
      new Response(body, {
        status: 422,
        headers: { "x-upstream-secret": "never-copied" },
      }),
    ]);
    let message = "";
    try {
      await runServiceProvider(setup.services, input, setup.outbound);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain(
      "Provider returned 422 on the paid retry (settlement header absent)"
    );
    expect(message).toContain('Body: "{\\"detail\\":\\"payment header invalid');
    expect(message).not.toContain("never-copied");
    expect(message).not.toContain("\n");
    expect(message.length).toBeLessThan(400);
    expect(message).toContain("Paid work was not refunded");
    expect(setup.signatures()).toBe(1);
    expect(setup.requests).toHaveLength(2);

    // A refusal before the 402 dance says so, and owes nobody a refund note.
    const unpaid = fixture([new Response("bad query", { status: 400 })]);
    await rejectsWith(
      runServiceProvider(unpaid.services, input, unpaid.outbound),
      'Provider returned 400 before any payment. Body: "bad query". Do not automatically retry.'
    );
    expect(unpaid.signatures()).toBe(0);
  });
  it("does not forward payment authorization to redirects", async () => {
    const setup = fixture([
      Response.json(offer(), { status: 402 }),
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example/steal" },
      }),
    ]);
    await rejectsWith(
      runServiceProvider(setup.services, input, setup.outbound),
      "redirects"
    );
    expect(setup.requests).toHaveLength(2);
  });
  it("uses X API directly and returns source posts without x402 supplier signing", async () => {
    const setup = fixture([
      Response.json({ data: [{ id: "123", text: "A public conversation" }] }),
    ]);
    const result = await runServiceProvider(
      setup.services,
      { ...input, service: "x_search" },
      setup.outbound
    );
    expect(setup.requests[0]?.url).toContain(
      "api.x.com/2/tweets/search/recent"
    );
    expect(setup.requests[0]?.url).toContain("max_results=10");
    expect(result.sources[0]?.url).toBe("https://x.com/i/status/123");
    expect(setup.signatures()).toBe(0);
  });
  it("polls an image job with its original authorization and never signs twice", async () => {
    const setup = fixture([
      Response.json(offer("53501"), { status: 402 }),
      Response.json({ id: "img_fixture" }, { status: 202 }),
      Response.json(
        { data: [{ b64_json: "iVBORw0KGgo=" }] },
        {
          headers: {
            "payment-response": encodeSettlementHeader({
              network: "eip155:8453",
              transactionId: "0ximage-settlement",
            }),
          },
        }
      ),
    ]);
    const result = await runServiceProvider(
      setup.services,
      { ...input, service: "image" },
      setup.outbound
    );
    expect(result.artifact?.mime).toBe("image/png");
    expect(result.upstreamTransactionId).toBe("0ximage-settlement");
    expect(setup.requests[2]?.payment).toBe("test-proof");
    expect(setup.requests[2]?.url).toContain("/images/generations/img_fixture");
    expect(setup.signatures()).toBe(1);
  });
  it("recovers a saved image job using only its original authorization", async () => {
    const setup = fixture([
      Response.json({ data: [{ b64_json: "iVBORw0KGgo=" }] }),
    ]);
    const result = await resumeServiceProvider(
      {
        providerJob: {
          id: "img_saved",
          headers: { "payment-signature": "saved-authorization" },
          transactionId: "saved-settlement",
        },
      },
      setup.outbound
    );
    expect(result.artifact?.mime).toBe("image/png");
    expect(result.upstreamTransactionId).toBe("saved-settlement");
    expect(setup.requests).toHaveLength(1);
    expect(setup.requests[0]?.url).toContain("/images/generations/img_saved");
    expect(setup.requests[0]?.payment).toBe("saved-authorization");
    expect(setup.signatures()).toBe(0);
  });
  it("accepts the inline raster fallback without another fetch or signature", async () => {
    const setup = fixture([
      Response.json(offer("53501"), { status: 402 }),
      Response.json({ data: [{ url: "data:image/png;base64,iVBORw0KGgo=" }] }),
    ]);
    const result = await runServiceProvider(
      setup.services,
      { ...input, service: "image" },
      setup.outbound
    );
    expect(result.artifact).toEqual({
      mime: "image/png",
      base64: "iVBORw0KGgo=",
    });
    expect(setup.requests).toHaveLength(2);
    expect(setup.signatures()).toBe(1);
  });
  it("refuses executable or mislabeled inline image payloads without retrying payment", async () => {
    await Promise.all(
      [
        "data:image/svg+xml;base64,PHN2Zz4=",
        "data:image/png;base64,PHNjcmlwdD4=",
      ].map(async (url) => {
        const setup = fixture([
          Response.json(offer("53501"), { status: 402 }),
          Response.json({ data: [{ url }] }),
        ]);
        await rejectsWith(
          runServiceProvider(
            setup.services,
            { ...input, service: "image" },
            setup.outbound
          ),
          "image"
        );
        expect(setup.requests).toHaveLength(2);
        expect(setup.signatures()).toBe(1);
      })
    );
  });
  it("cancels streaming responses as soon as they cross the byte limit", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    await rejectsWith(boundedBytes(new Response(stream), 15), "size limit");
    expect(cancelled).toBe(true);
  });
});
