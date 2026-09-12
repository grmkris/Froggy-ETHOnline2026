import { expect, test, spyOn } from "bun:test";

import { PrivyClient } from "@privy-io/node";
import { Schema } from "effect";

import { privyAgentSigner } from "./evm-signer";
import { privyExecution } from "./privy-execution";
import { tradeFixture } from "./trading-fixture";

test("the SDK forwards the exact browser-authorized body, key and expiry without a JWT exchange", async () => {
  const requests: { url: string; body: string; headers: Headers }[] = [];
  const client = new PrivyClient({
    appId: "test-app",
    appSecret: "test-secret",
    fetch: async (url, init) => {
      requests.push({
        url: url instanceof Request ? url.url : String(url),
        body: Schema.decodeUnknownSync(Schema.String)(init?.body),
        headers: new Headers(init?.headers),
      });
      return await Promise.resolve(
        Response.json({
          method: "wallet_sendCalls",
          data: { caip2: "eip155:8453", transaction_id: "provider-operation" },
        })
      );
    },
  });
  const execution = privyExecution(client, "test-app");
  const trade = tradeFixture("privy");
  const [raw] = trade.steps;
  if (raw?.payload.kind !== "evm") {
    throw new Error("Missing EVM fixture");
  }
  const step = {
    ...raw,
    payload: {
      kind: "evm_calls" as const,
      feePayer: "app" as const,
      calls: [raw.payload],
    },
  };
  const prepared = execution.authorization("embedded-wallet", trade, step);
  expect(prepared.body.sponsor).toBe(true);
  expect(prepared.url).toBe(
    "https://api.privy.io/v1/wallets/embedded-wallet/rpc"
  );
  expect(prepared.headers["privy-idempotency-key"]).toBe(step.id);
  const result = await execution.submit({
    walletId: "embedded-wallet",
    request: prepared.body,
    authorizationSignature: "test-owner-signature",
    idempotencyKey: step.id,
    expiresAt: step.expiresAt,
    providerTransactionId: null,
    userOperationHash: null,
  });
  expect(result).toBe("provider-operation");
  expect(requests).toHaveLength(1);
  const [sent] = requests;
  expect(sent?.url).toBe(prepared.url);
  expect(JSON.parse(sent?.body ?? "null")).toEqual(prepared.body);
  expect(sent?.headers.get("privy-authorization-signature")).toBe(
    "test-owner-signature"
  );
  expect(sent?.headers.get("privy-request-expiry")).toBe(
    String(step.expiresAt)
  );
  expect(sent?.headers.get("privy-idempotency-key")).toBe(step.id);
});

test("USDC signature encoding is resolved for each request without changing its policy or typed data", async () => {
  const client = new PrivyClient({
    appId: "test-app",
    appSecret: "test-secret",
  });
  const signing = spyOn(
    client.wallets().ethereum(),
    "signTypedData"
  ).mockResolvedValue({ signature: "0x1234", encoding: "hex" });
  let delegated = false;
  const signer = privyAgentSigner(client, {
    agent: {
      privateKey: "test-key",
      policyId: "test-policy",
      quorumId: "test-quorum",
    },
    wallet: {
      id: "embedded-wallet",
      address: "0x1111111111111111111111111111111111111111",
    },
    signatureOptionsFor: async () =>
      await Promise.resolve(delegated ? { type: "erc1271" } : undefined),
  });
  const typedData = {
    domain: { chainId: 8453 },
    types: {},
    primaryType: "TransferWithAuthorization",
    message: {},
  };
  try {
    await signer.signTypedData(typedData);
    delegated = true;
    await signer.signTypedData(typedData);
    expect(signing.mock.calls[0]?.[1].signature_options).toEqual({
      type: "ecdsa",
    });
    expect(signing.mock.calls[1]?.[1].signature_options).toEqual({
      type: "erc1271",
    });
    expect(signing.mock.calls[0]?.[1].caip2).toBe("eip155:8453");
    expect(signing.mock.calls[1]?.[1].caip2).toBe("eip155:8453");
    expect(signing.mock.calls[1]?.[1].params).toEqual(
      signing.mock.calls[0]?.[1].params
    );
    expect(signing.mock.calls[1]?.[1].authorization_context).toEqual({
      authorization_private_keys: ["test-key"],
    });
  } finally {
    signing.mockRestore();
  }
});
