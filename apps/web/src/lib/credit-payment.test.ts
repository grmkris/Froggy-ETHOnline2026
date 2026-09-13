import { afterEach, expect, spyOn, test } from "bun:test";

import { CreditPurchaseId } from "@froggy/domain";
import { CreditPurchase } from "@froggy/protocol";
import type { X402Challenge } from "@froggy/protocol";
import { Schema } from "effect";

import {
  creditPaymentWords,
  payCreditPurchaseInBrowser,
} from "./credit-payment";
import type { Identity } from "./privy";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TREASURY = "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2";
const ADDRESS = "0x5eca0000000000000000000000000000AbCd0344";
const SIGNATURE = `0x${"ab".repeat(65)}`;

const purchase = Schema.decodeUnknownSync(CreditPurchase)({
  v: 1,
  id: CreditPurchaseId.generate(),
  status: "quoted",
  creditUnits: 1_010_000,
  network: "eip155:8453",
  asset: USDC,
  amount: "1010000",
  payTo: TREASURY,
  expiresAt: 1_800_000_000_000,
  createdAt: 1_799_999_880_000,
  updatedAt: 1_799_999_880_000,
  transactionId: null,
  error: null,
  stubbed: false,
});

const challenge: X402Challenge = {
  x402Version: 2,
  resource: {
    url: `https://froggy.example/api/credits/purchases/${purchase.id}/pay`,
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:8453",
      amount: "1010000",
      asset: USDC,
      payTo: TREASURY,
      maxTimeoutSeconds: 120,
      extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
    },
  ],
};

interface Seen {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: unknown;
}
const seen: Seen[] = [];
const originalFetch = globalThis.fetch;
const answer = (
  respond: (request: Seen) => Response | Promise<Response>
): void => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const request: Seen = {
          method: init?.method ?? "GET",
          path: new URL(
            input instanceof Request ? input.url : input,
            "http://froggy"
          ).pathname,
          headers: new Headers(init?.headers),
          body: init?.body ?? null,
        };
        seen.push(request);
        return await respond(request);
      },
      originalFetch
    )
  );
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  seen.length = 0;
});

const signer = () => {
  const asked: Parameters<NonNullable<Identity["signTypedData"]>>[0][] = [];
  const sign: Identity["signTypedData"] = async (input) => {
    asked.push(input);
    return await Promise.resolve({ kind: "signed", signature: SIGNATURE });
  };
  return { asked, sign };
};

const quoteThenClaim = (): void => {
  answer((request) =>
    request.method === "GET"
      ? Response.json(challenge, { status: 402 })
      : Response.json({ ...purchase, status: "pending" }, { status: 202 })
  );
};

const decodeHeader = (header: string): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(JSON.parse(atob(header)));

test("signs exactly the quoted authorization and posts it as the payment header", async () => {
  quoteThenClaim();
  const { asked, sign } = signer();
  const outcome = await payCreditPurchaseInBrowser({
    purchase,
    address: ADDRESS,
    sign,
    token: "session-token",
    randomBytes: () => new Uint8Array(32).fill(9),
  });
  expect(outcome).toEqual({
    kind: "submitted",
    purchase: { ...purchase, status: "pending" },
  });
  expect(seen.map((request) => [request.method, request.path])).toEqual([
    ["GET", `/api/credits/purchases/${purchase.id}/pay`],
    ["POST", `/api/credits/purchases/${purchase.id}/pay`],
  ]);
  const [get, post] = seen;
  expect(get?.headers.get("authorization")).toBe("Bearer session-token");
  expect(post?.headers.get("authorization")).toBe("Bearer session-token");
  expect(post?.body).toBeNull();
  const header = post?.headers.get("payment-signature");
  if (header === null || header === undefined) {
    throw new Error("no payment header was sent");
  }
  expect(decodeHeader(header)).toEqual({
    x402Version: 2,
    resource: {
      url: `https://froggy.example/api/credits/purchases/${purchase.id}/pay`,
    },
    accepted: {
      scheme: "exact",
      network: "eip155:8453",
      amount: "1010000",
      asset: USDC,
      payTo: TREASURY,
      maxTimeoutSeconds: 120,
      extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
    },
    payload: {
      authorization: {
        from: ADDRESS,
        to: TREASURY,
        value: "1010000",
        validAfter: "0",
        validBefore: String(1_800_000_000 + 120),
        nonce: `0x${"09".repeat(32)}`,
      },
      signature: SIGNATURE,
    },
  });
  const [request] = asked;
  expect(request?.address).toBe(ADDRESS);
  expect(request?.typedData.domain).toEqual({
    name: "USD Coin",
    version: "2",
    chainId: 8453,
    verifyingContract: USDC,
  });
  expect(Object.keys(request?.typedData.types ?? {})).toEqual([
    "EIP712Domain",
    "TransferWithAuthorization",
  ]);
});

test("without a signer nothing is fetched and the person is told why", async () => {
  quoteThenClaim();
  const outcome = await payCreditPurchaseInBrowser({
    purchase,
    address: ADDRESS,
    sign: null,
    token: "t",
  });
  expect(outcome).toEqual({ kind: "no-signer" });
  expect(seen).toHaveLength(0);
  expect(creditPaymentWords({ kind: "no-signer" })).toContain("Privy sign-in");
});

test("a dismissed prompt posts nothing and leaves the quote for another try", async () => {
  quoteThenClaim();
  const outcome = await payCreditPurchaseInBrowser({
    purchase,
    address: ADDRESS,
    sign: async () => await Promise.resolve({ kind: "closed" }),
    token: "t",
  });
  expect(outcome).toEqual({ kind: "closed" });
  expect(seen.map((request) => request.method)).toEqual(["GET"]);
});

test("a quote without a signable USDC offer is refused before the wallet is asked", async () => {
  answer(() =>
    Response.json(
      {
        ...challenge,
        accepts: [{ ...challenge.accepts[0], extra: { version: "2" } }],
      },
      { status: 402 }
    )
  );
  const { asked, sign } = signer();
  const outcome = await payCreditPurchaseInBrowser({
    purchase,
    address: ADDRESS,
    sign,
    token: "t",
  });
  expect(outcome).toEqual({
    kind: "refused",
    reason: "This quote no longer offers USDC on your network.",
  });
  expect(asked).toHaveLength(0);
  expect(seen).toHaveLength(1);
});

test("the server's refusals arrive as its own words, and an expired quote as expiry", async () => {
  answer(() =>
    Response.json(
      { v: 1, code: "quote_expired", error: "This quote expired." },
      { status: 400 }
    )
  );
  const { sign } = signer();
  expect(
    await payCreditPurchaseInBrowser({
      purchase,
      address: ADDRESS,
      sign,
      token: "t",
    })
  ).toEqual({ kind: "expired" });
  globalThis.fetch = originalFetch;
  seen.length = 0;
  answer((request) =>
    request.method === "GET"
      ? Response.json(challenge, { status: 402 })
      : Response.json(
          {
            v: 1,
            code: "invalid_payment",
            error: "The signature does not belong to the paying wallet.",
          },
          { status: 400 }
        )
  );
  expect(
    await payCreditPurchaseInBrowser({
      purchase,
      address: ADDRESS,
      sign,
      token: "t",
    })
  ).toEqual({
    kind: "refused",
    reason: "The signature does not belong to the paying wallet.",
  });
});

test("a wallet refusal and an unreachable server each become one sentence", async () => {
  quoteThenClaim();
  expect(
    await payCreditPurchaseInBrowser({
      purchase,
      address: ADDRESS,
      sign: async () =>
        await Promise.resolve({ kind: "refused", reason: "Wallet locked." }),
      token: "t",
    })
  ).toEqual({
    kind: "refused",
    reason: "Your wallet did not sign the payment: Wallet locked.",
  });
  globalThis.fetch = originalFetch;
  seen.length = 0;
  answer(async () => await Promise.reject(new Error("offline")));
  const { sign } = signer();
  expect(
    await payCreditPurchaseInBrowser({
      purchase,
      address: ADDRESS,
      sign,
      token: "t",
    })
  ).toEqual({
    kind: "refused",
    reason: "Froggy could not be reached. Nothing was paid.",
  });
});
