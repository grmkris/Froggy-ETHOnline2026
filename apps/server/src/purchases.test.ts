import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { BrowserSession } from "@froggy/browser";
import {
  AgentTokenId,
  KNOWN_ASSETS,
  OAuthGrantId,
  SessionId,
  userId,
} from "@froggy/domain";
import type { PurchaseId } from "@froggy/domain";
import { encodeSettlementHeader, stubHederaPayer } from "@froggy/payments";
import type { PaymentChallenge } from "@froggy/payments";
import { PurchaseTicket } from "@froggy/protocol";
import { Effect, Schema } from "effect";

import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { handlePurchases } from "./purchase-routes";
import { PurchaseError, Purchases } from "./purchases";
import { createQuotes } from "./quotes";
import { ChatRunRegistry } from "./runs";
import { createServices } from "./services";
import { WorkspaceSession } from "./session";
import type { TaskCaller } from "./tasks";

let environment: Environment;
const servers: Bun.Server<undefined>[] = [];
beforeAll(async () => {
  Object.assign(process.env, {
    APP_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "",
    HEDERA_NETWORK: "hedera:testnet",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      await server.stop(true);
    })
  );
});

const fixture = async () => {
  const base = createServices({ environment });
  const meter = {
    signatures: 0,
    paid: 0,
    probes: 0,
    units: "1000000",
    responseError: false,
    settlementOnError: false,
    holdPaid: false,
    walletCreations: 0,
  };
  const paidStarted = Promise.withResolvers<boolean>();
  const paidRelease = Promise.withResolvers<boolean>();
  const stub = stubHederaPayer();
  const payer = {
    ...stub,
    pay: async (challenge: Parameters<typeof stub.pay>[0]) => {
      meter.signatures += 1;
      return await stub.pay(challenge);
    },
  };
  const adapters = {
    ...base,
    payer,
    hederaPayerFor: async () => await Promise.resolve(payer),
    privy: {
      ...base.privy,
      createSolanaWallet: async (
        request: Parameters<typeof base.privy.createSolanaWallet>[0]
      ) => {
        meter.walletCreations += 1;
        return await base.privy.createSolanaWallet(request);
      },
    },
  };
  const purchases = new Purchases(adapters);
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      if (request.headers.has("payment-signature")) {
        meter.paid += 1;
        paidStarted.resolve(true);
        if (meter.holdPaid) {
          await paidRelease.promise;
        }
        if (meter.responseError) {
          const headers = new Headers();
          if (meter.settlementOnError) {
            headers.set(
              "payment-response",
              encodeSettlementHeader({
                network: "hedera:testnet",
                transactionId: "0.0.7@123.456",
              })
            );
          }
          return new Response("Seller failed to deliver the paid report", {
            status: 500,
            headers,
          });
        }
        return new Response("The paid lending report", {
          headers: {
            "content-type": "text/plain",
            "payment-response": encodeSettlementHeader({
              network: "hedera:testnet",
              transactionId: "0.0.7@123.456",
            }),
          },
        });
      }
      meter.probes += 1;
      return Response.json(
        base.oracle.challenge({
          description: "Report",
          units: meter.units,
          url: request.url,
        }),
        { status: 402 }
      );
    },
  });
  servers.push(server);
  const session = new WorkspaceSession(
    SessionId.generate(),
    userId(`did:privy:purchase-${crypto.randomUUID()}`),
    {
      ledger: base.ledger,
      store: base.store,
      modes: environment.modes,
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      networks: {
        evm: environment.evmNetwork,
        hedera: environment.hederaNetwork,
      },
      quote: createQuotes(base.rates).quote,
      onPolicyDecision: () => {},
      onReceipt: () => {},
    },
    { hosts: [], payeeIds: [] }
  );
  await session.hydrate();
  const context = { session, source: "web" as const };
  const input = {
    v: 1 as const,
    url: `http://localhost:${server.port}/report`,
    purpose: "Read a report",
    idempotencyKey: crypto.randomUUID(),
    maxUsdMicros: 50_000,
  };
  return {
    base,
    purchases,
    session,
    context,
    input,
    meter,
    paidStarted,
    paidRelease,
    services: { ...adapters, purchases },
  };
};
const terminal = async (
  f: Awaited<ReturnType<typeof fixture>>,
  id: PurchaseId,
  remaining = 200
): Promise<PurchaseTicket> => {
  const row = await f.purchases.get(f.session.userId, id);
  if (row.status !== "paying" && row.status !== "probing") {
    return row;
  }
  if (remaining === 0) {
    throw new Error("Purchase did not finish.");
  }
  await Bun.sleep(10);
  return await terminal(f, id, remaining - 1);
};
const approve = async (
  f: Awaited<ReturnType<typeof fixture>>,
  row: PurchaseTicket
) => {
  await f.purchases.answer(
    f.context,
    row.id,
    { v: 1, approvalId: row.approvalId, decision: "allow_once" },
    "stub-owner"
  );
  return await terminal(f, row.id);
};

describe("durable x402 purchases", () => {
  it("asks for an unknown seller, pays once, and replays its saved result", async () => {
    const f = await fixture();
    const first = await f.purchases.request(f.context, f.input);
    expect(first.status).toBe("awaiting_approval");
    expect(f.meter.signatures).toBe(0);
    expect(f.session.allowsHost(new URL(f.input.url).host)).toBe(false);
    const [a, b] = await Promise.all([approve(f, first), approve(f, first)]);
    expect(a.status).toBe("completed");
    expect(b.status).toBe("completed");
    expect(a.delivery.body).toBe("The paid lending report");
    expect(a.receiptId).not.toBeNull();
    expect(a.stubbed).toBe(true);
    expect(a.payment.proofHash).toMatch(/^[a-f\d]{64}$/u);
    expect(f.meter.signatures).toBe(1);
    expect(f.meter.paid).toBe(1);
    const replay = await f.purchases.request(f.context, f.input);
    expect(replay.id).toBe(first.id);
    expect(f.meter.paid).toBe(1);
    expect(f.session.allowsHost(new URL(f.input.url).host)).toBe(false);
  });

  it("requires separate POST contact and exact-payment approvals", async () => {
    const f = await fixture();
    const first = await f.purchases.request(f.context, {
      ...f.input,
      method: "POST",
      body: '{"query":"lending"}',
    });
    expect(first.quote).toBeNull();
    expect(f.meter.probes).toBe(0);
    const priced = await approve(f, first);
    expect(priced.status).toBe("awaiting_approval");
    expect(priced.approvalId).not.toBe(first.approvalId);
    expect(f.meter.probes).toBe(1);
    expect(f.meter.signatures).toBe(0);
    expect(
      async () =>
        await f.purchases.answer(
          f.context,
          first.id,
          { v: 1, approvalId: first.approvalId, decision: "allow_once" },
          "stub-owner"
        )
    ).toThrow("approval changed");
    const paid = await approve(f, priced);
    expect(paid.status).toBe("completed");
    expect(f.meter.paid).toBe(1);
  });

  it("does not sign changed terms or prices over the caller's ceiling", async () => {
    const f = await fixture();
    const first = await f.purchases.request(f.context, f.input);
    f.meter.units = "2000000";
    const done = await approve(f, first);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("changed");
    expect(f.meter.signatures).toBe(0);
    const expensive = await f.purchases.request(f.context, {
      ...f.input,
      idempotencyKey: "cheap",
      maxUsdMicros: 1,
    });
    expect(expensive.status).toBe("failed");
    expect(expensive.error).toContain("ceiling");
  });

  it("declines without a signature and does not accept a changed idempotent body", async () => {
    const f = await fixture();
    const row = await f.purchases.request(f.context, f.input);
    const denied = await f.purchases.answer(
      f.context,
      row.id,
      { v: 1, approvalId: row.approvalId, decision: "deny" },
      "stub-owner"
    );
    expect(denied.status).toBe("declined");
    expect(denied.receiptId).not.toBeNull();
    expect(denied.grant).toBeNull();
    expect(f.session.history).toHaveLength(1);
    expect(f.session.history[0]).toMatchObject({
      id: denied.receiptId,
      approval: { id: row.approvalId, resolution: "deny" },
      decision: { _tag: "deny", code: "approval_denied" },
    });
    expect(f.session.history[0]?.settlement).toBeUndefined();
    const repeated = await approve(f, row);
    expect(repeated.status).toBe("declined");
    expect(repeated.receiptId).toBe(denied.receiptId);
    expect(f.session.history).toHaveLength(1);
    expect(f.meter.signatures).toBe(0);
    expect(
      async () =>
        await f.purchases.request(f.context, {
          ...f.input,
          url: `${f.input.url}?other=1`,
        })
    ).toThrow("different request");
  });

  it("records concurrent declines once and leaves contact-only declines without a spend", async () => {
    const f = await fixture();
    const row = await f.purchases.request(f.context, f.input);
    const deny = async () =>
      await f.purchases.answer(
        f.context,
        row.id,
        {
          v: 1,
          approvalId: row.approvalId,
          decision: "deny",
        },
        "stub-owner"
      );
    await Promise.all([deny(), deny()]);
    const declined = await f.purchases.get(f.session.userId, row.id);
    expect(declined.receiptId).not.toBeNull();
    expect(f.session.history).toHaveLength(1);
    const post = await f.purchases.request(f.context, {
      ...f.input,
      idempotencyKey: "contact-only",
      method: "POST",
      body: "{}",
    });
    const before = f.meter.probes;
    const contact = await f.purchases.answer(
      f.context,
      post.id,
      {
        v: 1,
        approvalId: post.approvalId,
        decision: "deny_stop",
      },
      "stub-owner"
    );
    expect(contact.status).toBe("declined");
    expect(contact.quote).toBeNull();
    expect(contact.receiptId).toBeNull();
    expect(f.session.history).toHaveLength(1);
    expect(f.meter.probes).toBe(before);
    expect(f.meter.signatures).toBe(0);
    expect(await f.base.ledger.since(f.session.userId, 0)).toEqual([]);
  });

  it("keeps failed paid delivery uncertain and never retries it", async () => {
    const f = await fixture();
    f.meter.responseError = true;
    const row = await f.purchases.request(f.context, f.input);
    const done = await approve(f, row);
    expect(done.status).toBe("uncertain");
    expect(done.payment.sentAt).not.toBeNull();
    expect(done.receiptId).not.toBeNull();
    const replay = await f.purchases.request(f.context, f.input);
    expect(replay.status).toBe("uncertain");
    expect(f.meter.paid).toBe(1);
    const ledger = await f.base.ledger.since(f.session.userId, 0);
    expect(ledger.some((entry) => entry.status === "uncertain")).toBe(true);
  });

  it("records confirmed settlement separately from failed paid delivery", async () => {
    const f = await fixture();
    f.meter.responseError = true;
    f.meter.settlementOnError = true;
    const row = await f.purchases.request(f.context, f.input);
    const done = await approve(f, row);
    expect(done.status).toBe("failed");
    expect(done.payment.state).toBe("settled");
    expect(done.delivery.state).toBe("failed");
    expect(done.error).toContain("Payment settled, but delivery failed");
    expect(f.session.history[0]?.failure).toContain("seller answered 500");
    expect(f.session.history[0]?.settlement?.transactionId).toBe(
      "0.0.7@123.456"
    );
    const ledger = await f.base.ledger.since(f.session.userId, 0);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.status).toBe("settled");
    const replay = await f.purchases.request(f.context, f.input);
    expect(replay.id).toBe(row.id);
    expect(replay.payment.state).toBe("settled");
    expect(f.meter.paid).toBe(1);
  });

  it("cannot cancel another owner's active purchase or abort its delivery", async () => {
    const f = await fixture();
    f.meter.holdPaid = true;
    const row = await f.purchases.request(f.context, f.input);
    await f.purchases.answer(
      f.context,
      row.id,
      {
        v: 1,
        approvalId: row.approvalId,
        decision: "allow_once",
      },
      "stub-owner"
    );
    await f.paidStarted.promise;
    try {
      await f.purchases.cancel(userId("did:privy:other-owner"), row.id);
      throw new Error("A different owner cancelled the purchase");
    } catch (error) {
      if (!(error instanceof PurchaseError)) {
        throw error;
      }
      expect(error.status).toBe(404);
      expect(error.message).toContain("not found");
    } finally {
      f.paidRelease.resolve(true);
    }
    const done = await terminal(f, row.id);
    expect(done.status).toBe("completed");
    expect(done.delivery.body).toBe("The paid lending report");
    expect(f.meter.signatures).toBe(1);
    expect(f.meter.paid).toBe(1);
  });

  it("cancels an active payment older than the latest fifty purchase records", async () => {
    const f = await fixture();
    f.meter.holdPaid = true;
    const row = await f.purchases.request(f.context, f.input);
    await f.purchases.answer(
      f.context,
      row.id,
      {
        v: 1,
        approvalId: row.approvalId,
        decision: "allow_once",
      },
      "stub-owner"
    );
    await f.paidStarted.promise;
    try {
      await Promise.all(
        Array.from(
          { length: 51 },
          async (_, index) =>
            await f.purchases.request(f.context, {
              ...f.input,
              idempotencyKey: `newer-${index}`,
              method: "POST",
              body: "{}",
            })
        )
      );
      const recent = await f.purchases.list(f.session.userId);
      expect(recent.some((purchase) => purchase.id === row.id)).toBe(false);
      await f.purchases.cancelAll(f.session.userId);
      const cancelled = await f.purchases.get(f.session.userId, row.id);
      expect(cancelled.receiptId).not.toBeNull();
      expect(f.session.history).toHaveLength(1);
    } finally {
      f.paidRelease.resolve(true);
    }
    const done = await terminal(f, row.id);
    expect(done.status).toBe("uncertain");
    expect(done.payment.sentAt).not.toBeNull();
    expect(f.meter.signatures).toBe(1);
    expect(f.meter.paid).toBe(1);
  });

  it("checks connection ownership and revocation again before signing", async () => {
    const f = await fixture();
    const connectionId = AgentTokenId.generate();
    await f.base.store.agents.create(f.session.userId, {
      id: connectionId,
      createdAt: Date.now(),
      label: "Claude",
      lastUsedAt: null,
      revokedAt: null,
      secretHash: "opaque-test-hash",
    });
    const row = await f.purchases.request(
      { ...f.context, source: "agent", connectionId },
      f.input
    );
    expect(
      async () =>
        await f.purchases.get(f.session.userId, row.id, AgentTokenId.generate())
    ).toThrow("not found");
    await f.base.store.agents.revoke(f.session.userId, connectionId);
    const done = await approve(f, row);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("disconnected");
    expect(f.meter.signatures).toBe(0);
  });
});

const route = async (
  f: Awaited<ReturnType<typeof fixture>>,
  caller: TaskCaller,
  path: string,
  method = "GET"
): Promise<Response> => {
  const response = await handlePurchases(
    f.services,
    new ChatRunRegistry(),
    {
      browser: new BrowserSession({
        profileDirectory: "/tmp/froggy-purchase-routes-unused",
      }),
      session: f.session,
      userId: f.session.userId,
    },
    caller,
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: { authorization: "Bearer external-agent-token" },
    })
  );
  if (response === null) {
    throw new Error("Purchase route was not matched");
  }
  return response;
};
const agentCaller = (f: Awaited<ReturnType<typeof fixture>>): TaskCaller => ({
  grantId: OAuthGrantId.generate(),
  agentTokenId: null,
  scopes: new Set(["pay"]),
  userId: f.session.userId,
});

describe("purchase HTTP routes", () => {
  it("refuses an agent's attempts to answer, cancel, or manage payment wallets", async () => {
    const f = await fixture();
    const caller = agentCaller(f);
    const row = await f.purchases.request(f.context, f.input);
    const responses = await Promise.all([
      route(f, caller, `/api/purchases/${row.id}/answer`, "POST"),
      route(f, caller, `/api/purchases/${row.id}/cancel`, "POST"),
      route(f, caller, "/api/purchases/wallets/solana", "POST"),
      route(f, caller, "/api/purchases/wallets"),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403, 403,
    ]);
    expect(f.meter.walletCreations).toBe(0);
    expect(f.meter.signatures).toBe(0);
    const unchanged = await f.purchases.get(f.session.userId, row.id);
    expect(unchanged.status).toBe("awaiting_approval");
  });

  it("returns a purchase only to its requesting connection or the workspace owner", async () => {
    const f = await fixture();
    const caller = agentCaller(f);
    if (caller.grantId === null) {
      throw new Error("Expected an OAuth caller");
    }
    const row = await f.purchases.request(
      {
        ...f.context,
        source: "agent",
        connectionId: caller.grantId,
      },
      f.input
    );
    const own = await route(f, caller, `/api/purchases/${row.id}`);
    expect(own.status).toBe(200);
    const ticket = Schema.decodeUnknownSync(PurchaseTicket)(await own.json());
    expect(ticket.id).toBe(row.id);
    const stranger = agentCaller(f);
    const other = await route(f, stranger, `/api/purchases/${row.id}`);
    expect(other.status).toBe(404);
    const list = await route(f, stranger, "/api/purchases");
    expect(await list.json()).toEqual({ v: 1, purchases: [] });
    const owner = await route(
      f,
      {
        userId: f.session.userId,
        grantId: null,
        agentTokenId: null,
        scopes: null,
      },
      `/api/purchases/${row.id}`
    );
    expect(owner.status).toBe(200);
  });
});

const BASE_USDC = KNOWN_ASSETS["eip155:84532:usdc"];
const SOLANA_USDC =
  KNOWN_ASSETS["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:usdc"];
const SOLANA_BUYER = "11111111111111111111111111111111";
// Canonical devnet USDC ATA derived from the synthetic buyer above.
const SOLANA_ACCOUNT = "27SXXCACcdgCZLU5hwYYjCb4j22H4ovDpHooVJpAJtXw";
const RpcRequest = Schema.Struct({ id: Schema.Json, method: Schema.String });
interface LiveFundingState {
  ethereum: bigint | null;
  solana: bigint | null;
  offers: PaymentChallenge["accepts"];
}
const liveFixture = async () => {
  const f = await fixture();
  const funding: LiveFundingState = {
    ethereum: 0n,
    solana: 100_000n,
    offers: [
      {
        network: BASE_USDC.network,
        asset: BASE_USDC.id,
        amount: "10000",
        scheme: "exact",
        payTo: "0x0000000000000000000000000000000000000001",
        extra: { name: "USDC", version: "2" },
        maxTimeoutSeconds: 60,
      },
      {
        network: SOLANA_USDC.network,
        asset: SOLANA_USDC.id,
        amount: "10000",
        scheme: "exact",
        payTo: SOLANA_BUYER,
        extra: { feePayer: "So11111111111111111111111111111111111111112" },
        maxTimeoutSeconds: 60,
      },
    ],
  };
  const calls = {
    ethereumSigner: 0,
    solanaSigner: 0,
    ethereumBalance: 0,
    solanaBalance: 0,
  };
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname !== "/rpc") {
        return Response.json(
          { x402Version: 2, accepts: funding.offers },
          { status: 402 }
        );
      }
      const rpc = Schema.decodeUnknownSync(RpcRequest)(await request.json());
      expect(rpc.method).toBe("getTokenAccountsByOwner");
      calls.solanaBalance += 1;
      if (funding.solana === null) {
        return Response.json({
          id: rpc.id,
          jsonrpc: "2.0",
          error: { code: -32_000, message: "Balance unavailable" },
        });
      }
      return Response.json({
        id: rpc.id,
        jsonrpc: "2.0",
        result: {
          context: { slot: 1 },
          value: [
            {
              pubkey: SOLANA_ACCOUNT,
              account: {
                data: {
                  parsed: {
                    info: {
                      mint: SOLANA_USDC.id,
                      owner: SOLANA_BUYER,
                      state: "initialized",
                      tokenAmount: {
                        amount: funding.solana.toString(),
                        decimals: 6,
                      },
                    },
                    type: "account",
                  },
                  program: "spl-token",
                  space: 165,
                },
                executable: false,
                lamports: 1,
                owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                rentEpoch: 0,
              },
            },
          ],
        },
      });
    },
  });
  servers.push(server);
  const adapters = {
    ...f.services,
    environment: {
      ...f.services.environment,
      evmNetwork: BASE_USDC.network,
      solanaNetwork: SOLANA_USDC.network,
      solanaRpcUrl: `${server.url.href}rpc`,
    },
    balances: {
      ...f.services.balances,
      usdc: async () => {
        calls.ethereumBalance += 1;
        return await Promise.resolve(funding.ethereum);
      },
    },
    privy: {
      ...f.services.privy,
      mode: "live" as const,
      paymentWallets: async () =>
        await Promise.resolve({
          ethereum: {
            id: "ethereum-test",
            address: "0x0000000000000000000000000000000000000002",
          },
          solana: { id: "solana-test", address: SOLANA_BUYER },
        }),
      ownerEvmSigner: async () => {
        calls.ethereumSigner += 1;
        return await Promise.resolve(null);
      },
      ownerSolanaSigner: async () => {
        calls.solanaSigner += 1;
        return await Promise.resolve(null);
      },
    },
  };
  const purchases = new Purchases(adapters);
  return {
    ...f,
    purchases,
    services: { ...adapters, purchases },
    funding,
    calls,
    input: { ...f.input, url: `${server.url.href}report` },
  };
};

describe("funding-aware purchase offers", () => {
  it("chooses funded Solana over unfunded Base and keeps that network after Base is funded", async () => {
    const f = await liveFixture();
    const row = await f.purchases.request(f.context, f.input);
    expect(row.status).toBe("awaiting_approval");
    expect(row.quote?.amount.asset.network).toBe(SOLANA_USDC.network);
    expect(f.calls.ethereumSigner + f.calls.solanaSigner).toBe(0);
    f.funding.ethereum = 100_000n;
    const done = await approve(f, row);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("Create your Solana wallet");
    expect(f.calls.solanaSigner).toBe(1);
    expect(f.calls.ethereumSigner).toBe(0);
    expect(f.calls.solanaBalance).toBe(2);
    expect(f.calls.ethereumBalance).toBe(1);
  });

  it("keeps an explicit network binding and reports unknown balances before owner authority", async () => {
    const f = await liveFixture();
    const pinned = await f.purchases.request(f.context, {
      ...f.input,
      network: BASE_USDC.network,
    });
    expect(pinned.status).toBe("failed");
    expect(pinned.error).toContain("Fund your Ethereum wallet");
    expect(pinned.error).toContain(BASE_USDC.network);
    expect(f.calls.solanaBalance).toBe(0);
    f.funding.ethereum = null;
    f.funding.solana = null;
    const unknown = await f.purchases.request(f.context, {
      ...f.input,
      idempotencyKey: "unknown-balance",
    });
    expect(unknown.status).toBe("failed");
    expect(unknown.error).toContain("Could not read your USDC balance");
    expect(f.calls.ethereumSigner + f.calls.solanaSigner).toBe(0);
  });

  it.each([BASE_USDC.network, SOLANA_USDC.network])(
    "rechecks %s funding after approval and before obtaining a signer",
    async (network) => {
      const f = await liveFixture();
      f.funding.ethereum = 100_000n;
      const row = await f.purchases.request(f.context, { ...f.input, network });
      expect(row.status).toBe("awaiting_approval");
      f.funding.ethereum = 0n;
      f.funding.solana = 0n;
      const done = await approve(f, row);
      expect(done.status).toBe("failed");
      expect(done.error).toContain("Fund your");
      expect(done.error).toContain(network);
      expect(done.payment.sentAt).toBeNull();
      expect(f.calls.ethereumSigner + f.calls.solanaSigner).toBe(0);
    }
  );

  it("rejects changed terms on the selected network even when another offer is funded", async () => {
    const f = await liveFixture();
    const row = await f.purchases.request(f.context, f.input);
    f.funding.ethereum = 100_000n;
    f.funding.offers = f.funding.offers.map((offer) =>
      offer.network === SOLANA_USDC.network
        ? { ...offer, amount: "20000" }
        : offer
    );
    const done = await approve(f, row);
    expect(done.status).toBe("failed");
    expect(done.error).toContain("changed its payment terms");
    expect(f.calls.ethereumSigner + f.calls.solanaSigner).toBe(0);
  });
});
