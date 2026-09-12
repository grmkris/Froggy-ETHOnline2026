import { expect, spyOn, test } from "bun:test";

import { APIError, PrivyClient } from "@privy-io/node";

import {
  privyAgentSigner,
  privyOwnerSigner,
  PrivySignerRefusedError,
} from "./evm-signer";
import type { SignatureOptionsResolver } from "./evm-signer";

const wallet = {
  id: "embedded-wallet",
  address: "0x1111111111111111111111111111111111111111",
};
const typedData = {
  domain: { chainId: 8453 },
  types: {},
  primaryType: "TransferWithAuthorization",
  message: { value: 4_000_000n },
};

const captureFailure = async (work: Promise<string>): Promise<Error | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
};

const factories = [
  {
    name: "agent",
    create: (
      client: PrivyClient,
      signatureOptionsFor: SignatureOptionsResolver
    ) =>
      privyAgentSigner(client, {
        agent: {
          privateKey: "test-key",
          policyId: "test-policy",
          quorumId: "test-quorum",
        },
        wallet,
        signatureOptionsFor,
      }),
  },
  {
    name: "owner",
    create: (
      client: PrivyClient,
      signatureOptionsFor: SignatureOptionsResolver
    ) =>
      privyOwnerSigner(client, {
        accessToken: "test-token",
        wallet,
        signatureOptionsFor,
      }),
  },
];

for (const factory of factories) {
  for (const delegated of [false, true]) {
    test.each([8453, 84_532, 8453n, "8453", "0x2105"])(
      `${factory.name} forwards the signing chain %p through the SDK (delegated: ${delegated})`,
      async (chainId) => {
        const client = new PrivyClient({
          appId: "test-app",
          appSecret: "test-secret",
        });
        const rpc = spyOn(client.wallets(), "rpc").mockResolvedValue({
          method: "eth_signTypedData_v4",
          data: { signature: "0x1234", encoding: "hex" },
        });
        const signer = factory.create(
          client,
          async () =>
            await Promise.resolve(delegated ? { type: "erc1271" } : null)
        );
        try {
          expect(
            await signer.signTypedData({ ...typedData, domain: { chainId } })
          ).toBe("0x1234");
          expect(rpc).toHaveBeenCalledTimes(1);
          expect(rpc.mock.calls[0]?.[1]).toMatchObject({
            method: "eth_signTypedData_v4",
            caip2: `eip155:${BigInt(chainId)}`,
            signature_options: { type: delegated ? "erc1271" : "ecdsa" },
            params: { typed_data: { message: { value: "4000000" } } },
          });
        } finally {
          rpc.mockRestore();
        }
      }
    );
  }

  test(`${factory.name} preserves chainless signing and refuses chainless contract encoding`, async () => {
    const client = new PrivyClient({
      appId: "test-app",
      appSecret: "test-secret",
    });
    const rpc = spyOn(client.wallets(), "rpc").mockResolvedValue({
      method: "eth_signTypedData_v4",
      data: { signature: "0x1234", encoding: "hex" },
    });
    try {
      const plain = factory.create(
        client,
        async () => await Promise.resolve(null)
      );
      await plain.signTypedData({ ...typedData, domain: {} });
      expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("signature_options");
      expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("caip2");
      const contract = factory.create(
        client,
        async () => await Promise.resolve({ type: "erc1271" })
      );
      const failure = await captureFailure(
        contract.signTypedData({ ...typedData, domain: {} })
      );
      expect(String(failure)).toContain("requires a signing chain");
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      rpc.mockRestore();
    }
  });

  test(`${factory.name} distinguishes malformed requests from signer refusals`, async () => {
    const client = new PrivyClient({
      appId: "test-app",
      appSecret: "test-secret",
    });
    const rpc = spyOn(client.wallets(), "rpc").mockRejectedValue(
      new APIError(
        400,
        {
          code: "invalid_data",
          error: "caip2 is required when signature_options is provided",
        },
        undefined,
        new Headers()
      )
    );
    try {
      const signer = factory.create(
        client,
        async () => await Promise.resolve(null)
      );
      const failure = await captureFailure(signer.signTypedData(typedData));
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(PrivySignerRefusedError);
      expect(String(failure)).toContain("Privy rejected the signing request");
      expect(String(failure)).not.toContain("under policy");
      rpc.mockRejectedValue(
        new APIError(
          403,
          { error: "no rule matched" },
          undefined,
          new Headers()
        )
      );
      const refused = factory.create(
        client,
        async () => await Promise.resolve(null)
      );
      const refusal = await captureFailure(refused.signTypedData(typedData));
      expect(refusal).toBeInstanceOf(PrivySignerRefusedError);
    } finally {
      rpc.mockRestore();
    }
  });
}
