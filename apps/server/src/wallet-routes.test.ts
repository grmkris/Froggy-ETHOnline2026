import { describe, expect, it } from "bun:test";

import { parQuote, SessionId, userId, WalletRequestId } from "@froggy/domain";
import { memoryLedger, memoryStore, stubPrivyServer } from "@froggy/wallet";

import { WorkspaceSession } from "./session";
import { WalletRequests } from "./wallet-requests";
import { handleWalletRoutes } from "./wallet-routes";

const ALICE = userId("did:privy:wallet-routes");

const unused = (): Promise<never> =>
  Promise.reject(new Error("unused in this test"));

describe("wallet routes", () => {
  it("lists no connections, and refuses a commit that is not a request", async () => {
    const store = memoryStore();
    const session = new WorkspaceSession(
      SessionId.generate(),
      ALICE,
      {
        balances: {
          hbar: async () => await Promise.resolve(null),
          usdc: async () => await Promise.resolve(null),
        },
        ledger: memoryLedger(),
        modes: {
          browser: "stub",
          database: "stub",
          graph: "stub",
          hedera: "stub",
          model: "stub",
          privy: "stub",
          telegram: "stub",
        },
        networks: { evm: "eip155:8453", hedera: "hedera:testnet" },
        onPolicyDecision: () => {},
        onReceipt: () => {},
        quote: (_asset, now) => parQuote(now),
        store,
      },
      { hosts: ["froggy.test"], payeeIds: ["0.0.1"] }
    );
    const walletRequests = new WalletRequests({
      appOrigin: "https://froggy.test",
      ask: unused,
      chainId: 8453,
      interactions: { resolve: () => true },
      network: "eip155:8453",
      policies: null,
      privy: stubPrivyServer(),
      publish: () => {},
      reads: {
        estimateGas: unused,
        request: unused,
      },
      rpc: {
        call: unused,
        chainId: unused,
        gasPrice: unused,
        maxPriorityFeePerGas: unused,
        sendRawTransaction: unused,
        transactionCount: unused,
        transactionKnown: unused,
        transactionReceipt: unused,
        waitForReceipt: unused,
      },
      store,
      stubbed: true,
      workspace: () => ({
        browser: {
          agentClick: unused,
          agentNavigate: unused,
          agentSnapshot: unused,
          agentType: unused,
          cancelPayment: unused,
          close: () => {},
          emitWalletEvent: unused,
          handleClientMessage: unused,
          pendingPayment: async () => await Promise.resolve(null),
          replayPayment: unused,
          replyWalletCall: async () => await Promise.resolve(true),
          resendLatest: () => {},
          state: () => ({
            activeTabId: null,
            error: null,
            interaction: "idle",
            queue: null,
            status: "unavailable",
            tabs: [],
            viewport: { height: 800, width: 1280 },
          }),
          subscribe: () => () => {},
          subscribePayments: () => () => {},
          subscribeWalletCalls: () => () => {},
          takePage: (): Promise<void> => Promise.resolve(),
        },
        session,
      }),
    });
    const deps = {
      appId: "app",
      appSecret: "secret",
      pins: null,
      policies: null,
      stubbed: true,
      walletRequests,
    };
    const listed = await handleWalletRoutes(
      deps,
      new Request("http://froggy/api/wallet-connections"),
      ALICE,
      "/api/wallet-connections"
    );
    expect(listed?.status).toBe(200);
    expect(await listed?.json()).toEqual({ connections: [] });

    const missing = await handleWalletRoutes(
      deps,
      new Request("http://froggy/api/wallet-requests/not-an-id/commit", {
        method: "POST",
      }),
      ALICE,
      `/api/wallet-requests/not-an-id/commit`
    );
    expect(missing?.status).toBe(400);

    const id = WalletRequestId.generate();
    const unknown = await handleWalletRoutes(
      deps,
      new Request(`http://froggy/api/wallet-requests/${id}/prepare`, {
        method: "POST",
      }),
      ALICE,
      `/api/wallet-requests/${id}/prepare`
    );
    expect(unknown?.status).toBe(404);
  });
});
