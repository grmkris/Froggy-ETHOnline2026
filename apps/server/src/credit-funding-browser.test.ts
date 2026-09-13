import { beforeAll, describe, expect, it } from "bun:test";

import { CreditPurchaseId, creditUnits, userId } from "@froggy/domain";
import type { CreditPurchase } from "@froggy/domain";
import { creditEvmAuthorization } from "@froggy/payments";
import {
  encodeExactPaymentHeader,
  exactEvmTypedData,
  nonceHex,
  selectExactEvmAccept,
} from "@froggy/protocol";
import type { X402Challenge } from "@froggy/protocol";
import { ConfigProvider, Effect } from "effect";
import { hashTypedData, isHex } from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CreditFunding } from "./credit-funding";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createServices } from "./services";

const NETWORK = "eip155:84532";
const TOKEN = `0x${"33".repeat(20)}`;
const TREASURY = `0x${"22".repeat(20)}`;
const AMOUNT = "1010000";
// Publicly known test keys; nothing signed here is ever broadcast.
const person = privateKeyToAccount(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
const stranger = privateKeyToAccount(
  "0x2222222222222222222222222222222222222222222222222222222222222222"
);

const hex = (value: string): Hex => {
  if (!isHex(value)) {
    throw new Error(`Expected hex, got ${value}`);
  }
  return value;
};

let environment: Environment;
beforeAll(async () => {
  const config = {
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    HEDERA_NETWORK: "hedera:testnet",
    HEDERA_ASSET: "0.0.0",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
    EVM_NETWORK: NETWORK,
    TREASURY_EVM_ADDRESS: "0xREPLACE_ME_TREASURY",
    TREASURY_WALLET_ID: "REPLACE_ME_TREASURY_WALLET_ID",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
  };
  environment = await Effect.runPromise(
    loadEnvironment().pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(config)
      )
    )
  );
});

const challenge: X402Challenge = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: NETWORK,
      asset: TOKEN,
      payTo: TREASURY,
      amount: AMOUNT,
      maxTimeoutSeconds: 120,
      extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
    },
  ],
};

/** A live (not stubbed) USDC quote, exactly as `create` would store it. */
const liveQuote = async (
  services: ReturnType<typeof createServices>,
  owner: ReturnType<typeof userId>,
  expiresAt: number
) => {
  const id = CreditPurchaseId.generate();
  const now = Date.now();
  await services.store.credits.createFunding(owner, {
    v: 1,
    id,
    status: "quoted",
    creditUnits: creditUnits(1_010_000),
    network: NETWORK,
    asset: TOKEN,
    amount: AMOUNT,
    payTo: TREASURY,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    transactionId: null,
    error: null,
    stubbed: false,
    idempotencyKey: id,
    requestFingerprint: id,
    challenge,
    proofHash: null,
    authorizationKey: null,
    paymentHeader: null,
    signedTransaction: null,
    transactionNonce: null,
  });
  return id;
};

const fixture = () => {
  const services = createServices({ environment });
  const owner = userId(`did:privy:browser-${crypto.randomUUID()}`);
  const funding = new CreditFunding({
    ...services,
    base: null,
    privy: {
      ...services.privy,
      paymentWallets: async () =>
        await Promise.resolve({
          ethereum: { id: "wallet-test", address: person.address },
          solana: null,
        }),
    },
    withTreasuryLock: async (operation) => await operation(),
  });
  return { services, owner, funding };
};

const accept = () => {
  const offer = selectExactEvmAccept(challenge, NETWORK);
  if (offer === null) {
    throw new Error("fixture offers no signable USDC leg");
  }
  return offer;
};

/** What the browser does: build the typed data from the quote, sign it, encode the header. */
const browserHeader = async (input: {
  readonly expiresAt: number;
  readonly from?: string;
  readonly signer?: typeof person;
  readonly nonce?: Uint8Array;
}) => {
  const offer = accept();
  const typedData = exactEvmTypedData({
    accept: offer,
    from: input.from ?? person.address,
    nonce: nonceHex(input.nonce ?? crypto.getRandomValues(new Uint8Array(32))),
    validBefore: Math.floor(input.expiresAt / 1000) + offer.maxTimeoutSeconds,
  });
  const message = {
    from: hex(typedData.message.from),
    to: hex(typedData.message.to),
    value: BigInt(typedData.message.value),
    validAfter: BigInt(typedData.message.validAfter),
    validBefore: BigInt(typedData.message.validBefore),
    nonce: hex(typedData.message.nonce),
  };
  const signature = await (input.signer ?? person).signTypedData({
    domain: {
      ...typedData.domain,
      chainId: BigInt(typedData.domain.chainId),
      verifyingContract: hex(typedData.domain.verifyingContract),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message,
  });
  return {
    typedData,
    message,
    header: encodeExactPaymentHeader({
      accept: offer,
      resource: undefined,
      authorization: typedData.message,
      signature,
    }),
  };
};

const settled = async (
  context: ReturnType<typeof fixture>,
  id: CreditPurchaseId,
  remaining = 100
): Promise<CreditPurchase> => {
  const purchase = await context.funding.get(context.owner, id);
  if (purchase.status !== "quoted" && purchase.status !== "pending") {
    return purchase;
  }
  if (remaining === 0) {
    throw new Error("Credit funding did not leave pending.");
  }
  await Bun.sleep(5);
  return await settled(context, id, remaining - 1);
};

describe("browser-signed USDC funding", () => {
  it("no longer signs USDC on the server: the body path asks for the browser", async () => {
    const context = fixture();
    const id = await liveQuote(
      context.services,
      context.owner,
      Date.now() + 120_000
    );
    expect(context.funding.pay(context.owner, id)).rejects.toThrow(
      "Sign the USDC payment in your browser"
    );
    const purchase = await context.funding.get(context.owner, id);
    expect(purchase.status).toBe("quoted");
    await context.services.shutdown();
  });

  it("hashes to the same EIP-712 digest with or without the EIP712Domain type listed", async () => {
    const { typedData, message } = await browserHeader({
      expiresAt: Date.now() + 120_000,
    });
    const domain = {
      ...typedData.domain,
      chainId: BigInt(typedData.domain.chainId),
      verifyingContract: hex(typedData.domain.verifyingContract),
    };
    const withDomainType = hashTypedData({
      domain,
      types: typedData.types,
      primaryType: "TransferWithAuthorization",
      message,
    });
    // The x402 facilitator verifies against exactly this type set.
    const facilitatorTypes = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    } as const;
    expect(withDomainType).toBe(
      hashTypedData({
        domain,
        types: facilitatorTypes,
        primaryType: "TransferWithAuthorization",
        message,
      })
    );
  });

  it("claims a browser-signed header once, keeps its identity, and replays idempotently", async () => {
    const context = fixture();
    const expiresAt = Date.now() + 120_000;
    const id = await liveQuote(context.services, context.owner, expiresAt);
    const { header } = await browserHeader({ expiresAt });
    const claimed = await context.funding.accept(context.owner, id, header);
    expect(claimed.status).toBe("pending");
    const row = await context.services.store.credits.findFunding(
      context.owner,
      id
    );
    expect(row?.paymentHeader).toBe(header);
    expect(row?.authorizationKey).toBe(creditEvmAuthorization(header));
    const replay = await context.funding.accept(context.owner, id, header);
    expect(replay.id).toBe(id);
    const another = await browserHeader({ expiresAt });
    expect(
      context.funding.accept(context.owner, id, another.header)
    ).rejects.toMatchObject({ code: "credit_conflict" });
    // With no treasury settlement configured the claim is held, never re-signed.
    const outcome = await settled(context, id);
    expect(outcome.status).toBe("uncertain");
    expect(outcome.error).toContain("USDC settlement is unavailable");
    const summary = await context.services.store.credits.summary(context.owner);
    expect(summary.availableUnits).toBe(creditUnits(0));
    await context.services.shutdown();
  });

  it("refuses a signature that is not the paying wallet's, and keeps the quote signable", async () => {
    const context = fixture();
    const expiresAt = Date.now() + 120_000;
    const id = await liveQuote(context.services, context.owner, expiresAt);
    const forged = await browserHeader({ expiresAt, signer: stranger });
    expect(
      context.funding.accept(context.owner, id, forged.header)
    ).rejects.toThrow("does not belong to the paying wallet");
    const elsewhere = await browserHeader({
      expiresAt,
      from: stranger.address,
      signer: stranger,
    });
    expect(
      context.funding.accept(context.owner, id, elsewhere.header)
    ).rejects.toThrow("must come from your connected USDC wallet");
    const untouched = await context.funding.get(context.owner, id);
    expect(untouched.status).toBe("quoted");
    const good = await browserHeader({ expiresAt });
    const claimed = await context.funding.accept(
      context.owner,
      id,
      good.header
    );
    expect(claimed.status).toBe("pending");
    await context.services.shutdown();
  });

  it("refuses an expired quote before reading any signature", async () => {
    const context = fixture();
    const expiresAt = Date.now() - 1;
    const id = await liveQuote(context.services, context.owner, expiresAt);
    const { header } = await browserHeader({ expiresAt: Date.now() + 120_000 });
    expect(
      context.funding.accept(context.owner, id, header)
    ).rejects.toMatchObject({ code: "quote_expired" });
    await context.services.shutdown();
  });

  it("refuses an authorization that outlives the quote", async () => {
    const context = fixture();
    const expiresAt = Date.now() + 120_000;
    const id = await liveQuote(context.services, context.owner, expiresAt);
    const { header } = await browserHeader({ expiresAt: expiresAt + 60_000 });
    expect(context.funding.accept(context.owner, id, header)).rejects.toThrow(
      "outlives this quote"
    );
    await context.services.shutdown();
  });
});
