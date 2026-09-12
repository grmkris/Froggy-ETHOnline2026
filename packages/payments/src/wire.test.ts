import { describe, expect, it } from "bun:test";

import type { PaymentRequired } from "@x402/core/types";

import { decodePaymentChallenge } from "./types";
import {
  challengeFrom,
  encodeChallengeHeader,
  paymentFrom,
  paymentHeaders,
  settlementHeaderFrom,
} from "./wire";

const challenge: PaymentRequired = {
  accepts: [
    {
      amount: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" },
      maxTimeoutSeconds: 300,
      network: "eip155:8453",
      payTo: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
      scheme: "exact",
    },
  ],
  error: "Payment required.",
  resource: { url: "https://seller.test/brief" },
  x402Version: 2,
};

describe("challengeFrom", () => {
  it("reads a v2 challenge from the header, with an empty body", async () => {
    const response = new Response(null, {
      headers: { "payment-required": encodeChallengeHeader(challenge) },
      status: 402,
    });
    const read = await challengeFrom(response);
    expect(read?.accepts[0]?.amount).toBe("10000");
  });

  it("reads a v2 challenge from the JSON body", async () => {
    const response = Response.json(challenge, { status: 402 });
    const read = await challengeFrom(response);
    expect(read?.accepts[0]?.network).toBe("eip155:8453");
  });

  it("accepts a v2 challenge without optional resource metadata", async () => {
    const response = Response.json({
      accepts: challenge.accepts,
      x402Version: 2,
    });
    const decoded = await challengeFrom(response);
    expect(decoded?.accepts).toHaveLength(1);
  });

  it.each([undefined, 1, 3])(
    "refuses a challenge with unsupported or missing version %s",
    async (x402Version) => {
      expect(
        await challengeFrom(Response.json({ ...challenge, x402Version }))
      ).toBeNull();
    }
  );

  it("refuses v1 requirements rather than treating them as v2", async () => {
    const response = Response.json({
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "10000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
        },
      ],
    });
    expect(await challengeFrom(response)).toBeNull();
  });

  it.each([0, 17])("refuses an invalid offer count of %s", async (count) => {
    const response = Response.json({
      ...challenge,
      accepts: Array.from({ length: count }, () => challenge.accepts).flat(),
    });
    expect(await challengeFrom(response)).toBeNull();
  });

  it("cancels a body once it exceeds the challenge byte limit", async () => {
    let reads = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          reads += 1;
          controller.enqueue(new Uint8Array(8192).fill(32));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 402 }
    );
    expect(await challengeFrom(response)).toBeNull();
    expect(cancelled).toBe(true);
    expect(reads).toBeLessThanOrEqual(10);
  });

  it("bounds the encoded header and cancels the unused body", async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: {
          "payment-required": encodeChallengeHeader({
            ...challenge,
            error: "x".repeat(65_536),
          }),
        },
        status: 402,
      }
    );
    expect(await challengeFrom(response)).toBeNull();
    expect(cancelled).toBe(true);
  });

  it("does not ignore invalid characters in a base64 challenge header", async () => {
    const response = new Response(null, {
      headers: {
        "payment-required": `!!${encodeChallengeHeader(challenge)}`,
      },
      status: 402,
    });
    expect(await challengeFrom(response)).toBeNull();
  });

  it("is null for a 402 that is not x402", async () => {
    expect(
      await challengeFrom(new Response("nope", { status: 402 }))
    ).toBeNull();
    expect(
      await challengeFrom(
        new Response(null, {
          headers: { "payment-required": "!!" },
          status: 402,
        })
      )
    ).toBeNull();
  });
});

describe("headers", () => {
  it("sends the payment under both names and reads either", () => {
    const sent = paymentHeaders("abc");
    expect(Object.keys(sent).toSorted()).toEqual([
      "payment-signature",
      "x-payment",
    ]);
    expect(paymentFrom(new Headers({ "x-payment": "v1" }))).toBe("v1");
    expect(paymentFrom(new Headers({ "payment-signature": "v2" }))).toBe("v2");
    expect(settlementHeaderFrom(new Headers({ "payment-response": "s" }))).toBe(
      "s"
    );
    expect(settlementHeaderFrom(new Headers())).toBeNull();
  });
});

describe("decodePaymentChallenge", () => {
  it("reads a seller's resource block into one canonical shape, whatever else it carried", () => {
    // A saved quote carries the seller's full block; the card that pays it
    // only ever carried url, description and mimeType, in its own order. The
    // two are compared field for field, so both must decode to the same thing.
    const saved = decodePaymentChallenge({
      ...challenge,
      resource: {
        description: "A browse",
        mimeType: "application/json",
        serviceName: "Froggy",
        tags: ["browser"],
        url: "https://seller.test/tasks?quote=1",
      },
    });
    const card = decodePaymentChallenge({
      ...challenge,
      resource: {
        url: "https://seller.test/tasks?quote=1",
        description: "A browse",
        mimeType: "application/json",
      },
    });
    if (saved._tag !== "Success" || card._tag !== "Success") {
      throw new Error("A well-formed challenge must decode.");
    }
    expect(JSON.stringify(saved.success)).toBe(JSON.stringify(card.success));
    expect(saved.success.resource).toEqual({
      url: "https://seller.test/tasks?quote=1",
      description: "A browse",
      mimeType: "application/json",
    });
  });

  it("keeps an odd resource block rather than refusing the challenge", () => {
    const odd = decodePaymentChallenge({ ...challenge, resource: { url: 42 } });
    expect(odd._tag).toBe("Success");
  });
});
