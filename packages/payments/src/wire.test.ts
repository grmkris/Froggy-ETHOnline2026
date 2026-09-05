import { describe, expect, it } from "bun:test";

import type { PaymentRequired } from "@x402/core/types";

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

  it("reads a v1 challenge from the body", async () => {
    const response = Response.json(challenge, { status: 402 });
    const read = await challengeFrom(response);
    expect(read?.accepts[0]?.network).toBe("eip155:8453");
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
