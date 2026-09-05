import { describe, expect, it } from "bun:test";

import { evmPayer, SignerRefusedError } from "./evm";
import type { TypedData } from "./evm";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const challenge = {
  accepts: [
    {
      amount: "10000",
      asset: USDC,
      extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" },
      network: "eip155:8453",
      payTo: PAY_TO,
      scheme: "exact",
    },
  ],
  x402Version: 2,
};

describe("evmPayer", () => {
  it("signs an EIP-3009 authorization to the payee for the exact amount", async () => {
    const signed: TypedData["message"][] = [];
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async (typed) => {
          signed.push(typed.message);
          await Promise.resolve();
          return `0x${"ab".repeat(65)}`;
        },
      },
    });
    const attempt = await payer.pay(challenge);
    expect(attempt.header).not.toBeNull();
    expect(signed[0]).toMatchObject({
      from: ADDRESS,
      to: PAY_TO,
      value: 10_000n,
    });
    // SAFETY: the test built the header from a known payload one line up.
    const payload = JSON.parse(
      Buffer.from(attempt.header ?? "", "base64").toString("utf-8")
    ) as { accepted: { network: string }; payload: { signature: string } };
    expect(payload.accepted.network).toBe("eip155:8453");
    expect(payload.payload.signature.startsWith("0x")).toBe(true);
  });

  it("declines a challenge for another network without asking the signer", async () => {
    let asked = 0;
    const payer = evmPayer({
      network: "eip155:84532",
      signer: {
        address: ADDRESS,
        signTypedData: async () => {
          asked += 1;
          await Promise.resolve();
          return "0x";
        },
      },
    });
    const attempt = await payer.pay(challenge);
    expect(attempt.header).toBeNull();
    expect(asked).toBe(0);
  });

  it("surfaces the signer's refusal as itself", async () => {
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async () => {
          await Promise.resolve();
          throw new SignerRefusedError(
            "Policy pol_1 denied eth_signTypedData_v4"
          );
        },
      },
    });
    let caught: Error | null = null;
    try {
      await payer.pay(challenge);
    } catch (error) {
      caught = error instanceof Error ? error : null;
    }
    expect(caught).toBeInstanceOf(SignerRefusedError);
  });
});
