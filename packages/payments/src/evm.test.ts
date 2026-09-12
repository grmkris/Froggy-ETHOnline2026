import { describe, expect, it } from "bun:test";

import { evmPayer, SignerRefusedError } from "./evm";
import type { TypedData } from "./evm";
import type { PaymentChallenge } from "./types";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PAY_TO = "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const offer = {
  amount: "10000",
  asset: USDC,
  extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" },
  network: "eip155:8453",
  payTo: PAY_TO,
  scheme: "exact",
};
const challenge = { accepts: [offer], x402Version: 2 };

const decodePayload = (header: string | null) =>
  // SAFETY: the tests build the header from a known payload one line up.
  JSON.parse(Buffer.from(header ?? "", "base64").toString("utf-8")) as {
    resource?: unknown;
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

  it("echoes the seller's resource block like the reference client, and drops a malformed one", async () => {
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async () =>
          await Promise.resolve(`0x${"ab".repeat(65)}`),
      },
    });
    const resource = {
      url: "https://api.you.com/v1/search",
      description: "Web search",
      mimeType: "application/json",
    };
    const echoed = await payer.pay({ ...challenge, resource });
    expect(decodePayload(echoed.header).resource).toEqual(resource);

    const bare = await payer.pay(challenge);
    expect("resource" in decodePayload(bare.header)).toBe(false);

    // A seller's odd resource block is not a reason to refuse to pay.
    const odd = await payer.pay({ ...challenge, resource: { url: 42 } });
    expect(odd.header).not.toBeNull();
    expect("resource" in decodePayload(odd.header)).toBe(false);
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

  it.each(["permit2", "unknown"])(
    "refuses %s before asking the signer",
    async (assetTransferMethod) => {
      let asked = 0;
      const payer = evmPayer({
        network: "eip155:8453",
        signer: {
          address: ADDRESS,
          signTypedData: async () => {
            asked += 1;
            return await Promise.resolve(`0x${"ab".repeat(65)}`);
          },
        },
      });
      const attempt = await payer.pay({
        ...challenge,
        accepts: [{ ...offer, extra: { ...offer.extra, assetTransferMethod } }],
      });
      expect(attempt.header).toBeNull();
      expect(attempt.error).toContain("EIP-3009");
      expect(asked).toBe(0);
    }
  );

  it("refuses malformed payment terms before asking the signer", async () => {
    let asked = 0;
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async () => {
          asked += 1;
          return await Promise.resolve(`0x${"ab".repeat(65)}`);
        },
      },
    });
    const malformed: readonly Partial<PaymentChallenge["accepts"][number]>[] = [
      { amount: "0" },
      { amount: "-1" },
      { amount: "1.5" },
      { amount: "1".repeat(79) },
      { amount: (2n ** 256n).toString() },
      { asset: "0.0.0" },
      { payTo: "not-an-address" },
      { extra: { assetTransferMethod: "eip3009" } },
      { extra: { ...offer.extra, assetTransferMethod: 123 } },
      { maxTimeoutSeconds: 0 },
      { maxTimeoutSeconds: -1 },
      { maxTimeoutSeconds: 1.5 },
      { maxTimeoutSeconds: 3601 },
    ];
    await Promise.all(
      malformed.map(async (invalid) => {
        const attempt = await payer.pay({
          ...challenge,
          accepts: [{ ...offer, ...invalid }],
        });
        expect(attempt.header).toBeNull();
        expect(attempt.error).toContain("EIP-3009");
      })
    );
    expect(asked).toBe(0);
  });

  it("signs only the selected offer when the caller pins a challenge", async () => {
    const signed: TypedData[] = [];
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async (typed) => {
          signed.push(typed);
          return await Promise.resolve(`0x${"ab".repeat(65)}`);
        },
      },
    });
    const selected = {
      ...offer,
      amount: "12000",
      payTo: "0x2222222222222222222222222222222222222222",
      extra: { name: "USD Coin", version: "2" },
    };
    const offered = { ...challenge, accepts: [offer, selected] };
    const attempt = await payer.pay({ ...offered, accepts: [selected] });
    expect(attempt.requirements?.payTo).toBe(selected.payTo);
    expect(signed).toHaveLength(1);
    expect(signed[0]?.primaryType).toBe("TransferWithAuthorization");
    expect(signed[0]?.message).toMatchObject({
      to: selected.payTo,
      value: 12_000n,
    });
  });

  it("refuses a malformed signer result", async () => {
    const payer = evmPayer({
      network: "eip155:8453",
      signer: {
        address: ADDRESS,
        signTypedData: async () => await Promise.resolve("0xnot-hex"),
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
