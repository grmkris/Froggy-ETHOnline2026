import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import {
  encodeExactPaymentHeader,
  exactEvmTypedData,
  nonceHex,
  selectExactEvmAccept,
} from "./x402-exact";
import type { X402Challenge } from "./x402-exact";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TREASURY = "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2";
const FROM = "0x5eca0000000000000000000000000000AbCd0344";

const challenge: X402Challenge = {
  x402Version: 2,
  resource: {
    url: "https://froggy.example/api/credits/purchases/cpu_1/pay",
    description: "Buy 101 Froggy credits · one transfer",
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: "hedera:mainnet",
      amount: "12345678",
      asset: "0.0.0",
      payTo: "0.0.10847556",
      maxTimeoutSeconds: 120,
      extra: { feePayer: "0.0.10571514" },
    },
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

describe("selectExactEvmAccept", () => {
  it("picks the exact offer on the requested EVM network", () => {
    const accept = selectExactEvmAccept(challenge, "eip155:8453");
    expect(accept).toEqual({
      scheme: "exact",
      network: "eip155:8453",
      amount: "1010000",
      asset: USDC,
      payTo: TREASURY,
      maxTimeoutSeconds: 120,
      extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
    });
  });

  it("returns null when the network is absent or the offer cannot be signed", () => {
    expect(selectExactEvmAccept(challenge, "eip155:84532")).toBeNull();
    expect(selectExactEvmAccept(challenge, "hedera:mainnet")).toBeNull();
    const [, base] = challenge.accepts;
    if (base === undefined) {
      throw new Error("fixture");
    }
    const without = (patch: Partial<typeof base>): X402Challenge => ({
      ...challenge,
      accepts: [{ ...base, ...patch }],
    });
    expect(
      selectExactEvmAccept(without({ extra: { version: "2" } }), "eip155:8453")
    ).toBeNull();
    expect(
      selectExactEvmAccept(without({ asset: "USDC" }), "eip155:8453")
    ).toBeNull();
    expect(
      selectExactEvmAccept(without({ scheme: "upto" }), "eip155:8453")
    ).toBeNull();
    expect(
      selectExactEvmAccept(without({ amount: "0" }), "eip155:8453")
    ).toBeNull();
    expect(
      selectExactEvmAccept(
        without({ maxTimeoutSeconds: undefined }),
        "eip155:8453"
      )
    ).toBeNull();
  });
});

describe("exactEvmTypedData", () => {
  it("builds the EIP-3009 document the facilitator verifies, domain type included", () => {
    const accept = selectExactEvmAccept(challenge, "eip155:8453");
    if (accept === null) {
      throw new Error("fixture");
    }
    const nonce = nonceHex(new Uint8Array(32).fill(7));
    expect(
      exactEvmTypedData({
        accept,
        from: FROM,
        nonce,
        validBefore: 1_800_000_120,
      })
    ).toEqual({
      domain: {
        name: "USD Coin",
        version: "2",
        chainId: 8453,
        verifyingContract: USDC,
      },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: FROM,
        to: TREASURY,
        value: "1010000",
        validAfter: "0",
        validBefore: "1800000120",
        nonce: `0x${"07".repeat(32)}`,
      },
    });
  });

  it("refuses a nonce that is not 32 bytes", () => {
    expect(() => nonceHex(new Uint8Array(31))).toThrow("32 bytes");
  });
});

describe("encodeExactPaymentHeader", () => {
  it("round-trips to the envelope the server decodes, non-ASCII text included", () => {
    const accept = selectExactEvmAccept(challenge, "eip155:8453");
    if (accept === null) {
      throw new Error("fixture");
    }
    const typedData = exactEvmTypedData({
      accept,
      from: FROM,
      nonce: nonceHex(new Uint8Array(32).fill(1)),
      validBefore: 1_800_000_120,
    });
    const signature = `0x${"ab".repeat(65)}`;
    const header = encodeExactPaymentHeader({
      accept,
      resource: challenge.resource,
      authorization: typedData.message,
      signature,
    });
    expect(header).toMatch(/^[A-Za-z\d+/]+=*$/u);
    const decoded: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(header), (char) => char.codePointAt(0) ?? 0)
      )
    );
    expect(decoded).toEqual({
      x402Version: 2,
      resource: challenge.resource,
      accepted: accept,
      payload: { authorization: typedData.message, signature },
    });
  });

  it("omits the resource when the challenge carried none", () => {
    const accept = selectExactEvmAccept(challenge, "eip155:8453");
    if (accept === null) {
      throw new Error("fixture");
    }
    const header = encodeExactPaymentHeader({
      accept,
      resource: undefined,
      authorization: exactEvmTypedData({
        accept,
        from: FROM,
        nonce: nonceHex(new Uint8Array(32)),
        validBefore: 1,
      }).message,
      signature: "0x00",
    });
    const envelope = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown)
    )(JSON.parse(atob(header)));
    expect(Object.keys(envelope)).toEqual([
      "x402Version",
      "accepted",
      "payload",
    ]);
  });
});
