import { describe, expect, it } from "bun:test";

import type { BrowserHandle } from "@froggy/browser";
import { EvmAddress, SessionId, TabId, parQuote, userId } from "@froggy/domain";
import type { BrowserWalletEvent, BrowserWalletReply } from "@froggy/protocol";
import { memoryLedger, memoryStore, stubPrivyServer } from "@froggy/wallet";
import type { EvmReads, EvmRpc } from "@froggy/wallet";
import { Schema } from "effect";

import type { ApprovalOutcome } from "./interactions";
import { WorkspaceSession } from "./session";
import type { AskInput, SessionDeps } from "./session";
import { WalletRequests } from "./wallet-requests";

const ALICE = userId("did:privy:wallet-requests");
const ADDRESS = Schema.decodeUnknownSync(EvmAddress)(
  "0x00000000000000000000000000000000000000aa"
);
const ORIGIN = "https://app.uniswap.org";
const APP_ORIGIN = "https://froggy.test";
const NOW = 1_800_000_000_000;
const TAB = TabId.generate();

const MODES: SessionDeps["modes"] = {
  browser: "stub",
  database: "stub",
  graph: "stub",
  hedera: "stub",
  model: "stub",
  privy: "stub",
  telegram: "stub",
};

const unused = async (): Promise<never> =>
  await Promise.reject(new Error("unused in this test"));

const reads: EvmReads = {
  estimateGas: async () => await Promise.resolve(21_000n),
  request: async () => await Promise.resolve("0x1"),
};

const rpc: EvmRpc = {
  call: unused,
  chainId: async () => await Promise.resolve(8453),
  gasPrice: unused,
  maxPriorityFeePerGas: unused,
  sendRawTransaction: unused,
  transactionCount: unused,
  transactionKnown: async () => await Promise.resolve(false),
  transactionReceipt: async () => await Promise.resolve(null),
  waitForReceipt: unused,
};

interface ReplyBag {
  events: BrowserWalletEvent[];
  replies: BrowserWalletReply[];
}

const emptyBag = (): ReplyBag => ({ events: [], replies: [] });

const fakeBrowser = (bag: ReplyBag): BrowserHandle => ({
  agentClick: unused,
  agentNavigate: unused,
  agentSnapshot: unused,
  agentType: unused,
  cancelPayment: unused,
  close: () => {},
  emitWalletEvent: async (event) => {
    bag.events.push(event);
    await Promise.resolve();
  },
  handleClientMessage: unused,
  pendingPayment: async () => await Promise.resolve(null),
  replayPayment: unused,
  replyWalletCall: async (_tab, _context, reply) => {
    bag.replies.push(reply);
    return await Promise.resolve(true);
  },
  resendLatest: () => {},
  state: () => ({
    activeTabId: TAB,
    error: null,
    interaction: "agent",
    queue: null,
    status: "running",
    tabs: [
      { id: TAB, loading: false, title: "Uniswap", url: `${ORIGIN}/swap` },
    ],
    viewport: { height: 800, width: 1280 },
  }),
  subscribe: () => () => {},
  subscribePayments: () => () => {},
  subscribeWalletCalls: () => () => {},
  takePage: async (): Promise<void> => {
    await Promise.resolve();
  },
});

const sessionOf = (store: ReturnType<typeof memoryStore>): WorkspaceSession => {
  const session = new WorkspaceSession(
    SessionId.generate(),
    ALICE,
    {
      balances: {
        hbar: async () => await Promise.resolve(null),
        usdc: async () => await Promise.resolve(null),
      },
      ledger: memoryLedger(),
      modes: MODES,
      networks: { evm: "eip155:8453", hedera: "hedera:testnet" },
      onPolicyDecision: () => {},
      onReceipt: () => {},
      quote: (_asset, now) => parQuote(now),
      store,
    },
    { hosts: ["froggy.test"], payeeIds: ["0.0.1"] }
  );
  session.setWallet({ address: ADDRESS, id: "wallet-alice" });
  return session;
};

const observation = (
  method:
    | "eth_accounts"
    | "eth_chainId"
    | "eth_requestAccounts"
    | "eth_sendTransaction"
    | "personal_sign",
  params: readonly unknown[],
  origin = ORIGIN,
  isTop = true
) => ({
  call: { id: "page-1", method, params, v: 1 as const },
  context: {
    contextId: "ctx-1",
    frameId: "frame-1",
    isTop,
    origin,
    tabId: TAB,
    topOrigin: origin,
  },
  observedAt: NOW,
});

const coordinator = (input: {
  readonly answer?: ApprovalOutcome;
  readonly asked?: AskInput[];
  readonly browser: BrowserHandle;
  readonly released?: string[];
  readonly session: WorkspaceSession;
  readonly store: ReturnType<typeof memoryStore>;
}): WalletRequests =>
  new WalletRequests({
    appOrigin: APP_ORIGIN,
    ask: async (_userId, card) => {
      input.asked?.push(card);
      return await Promise.resolve(
        input.answer ?? {
          accessToken: "token",
          kind: "answered",
          optionId: "allow_once",
        }
      );
    },
    chainId: 8453,
    interactions: {
      resolve: (_userId, requestId) => {
        input.released?.push(requestId);
        return true;
      },
    },
    network: "eip155:8453",
    now: () => NOW,
    policies: null,
    privy: stubPrivyServer(),
    publish: () => {},
    reads,
    rpc,
    store: input.store,
    stubbed: true,
    workspace: () => ({ browser: input.browser, session: input.session }),
  });

const decodeReplyString = Schema.decodeUnknownSync(Schema.String);
const decodeReplyStrings = Schema.decodeUnknownSync(
  Schema.Array(Schema.String)
);

const stringResult = (reply: BrowserWalletReply | undefined): string => {
  if (reply === undefined || !reply.ok) {
    throw new Error("expected a wallet string");
  }
  return decodeReplyString(JSON.parse(reply.result));
};

const accountsResult = (
  reply: BrowserWalletReply | undefined
): readonly string[] => {
  if (reply === undefined || !reply.ok) {
    throw new Error("expected wallet accounts");
  }
  return decodeReplyStrings(JSON.parse(reply.result));
};

describe("WalletRequests", () => {
  it("answers chain id without a card", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const requests = coordinator({
      browser: fakeBrowser(bag),
      session: sessionOf(store),
      store,
    });
    await requests.observe(ALICE, observation("eth_chainId", []));
    expect(stringResult(bag.replies[0])).toBe("0x2105");
  });

  it("refuses Froggy's own origin", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const requests = coordinator({
      browser: fakeBrowser(bag),
      session: sessionOf(store),
      store,
    });
    await requests.observe(
      ALICE,
      observation("eth_requestAccounts", [], APP_ORIGIN)
    );
    expect(bag.replies[0]).toMatchObject({
      error: { code: 4200 },
      ok: false,
    });
  });

  it("refuses connect from an iframe", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const requests = coordinator({
      browser: fakeBrowser(bag),
      session: sessionOf(store),
      store,
    });
    await requests.observe(
      ALICE,
      observation("eth_requestAccounts", [], ORIGIN, false)
    );
    expect(bag.replies[0]).toMatchObject({
      error: { code: 4200 },
      ok: false,
    });
  });

  it("grants a connection after Allow once, then answers eth_accounts", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const asked: AskInput[] = [];
    const requests = coordinator({
      asked,
      browser: fakeBrowser(bag),
      session: sessionOf(store),
      store,
    });
    await requests.observe(ALICE, observation("eth_requestAccounts", []));
    expect(asked[0]?.request.wallet?.kind).toBe("connect");
    expect(asked[0]?.request.wallet?.needsSignature).toBe(false);
    expect(accountsResult(bag.replies[0])).toEqual([ADDRESS]);
    expect(bag.events[0]?.event).toBe("accountsChanged");
    expect(await store.walletConnections.active(ALICE, ORIGIN)).toMatchObject({
      address: ADDRESS,
      origin: ORIGIN,
    });
    bag.replies.length = 0;
    await requests.observe(ALICE, observation("eth_accounts", []));
    expect(accountsResult(bag.replies[0])).toEqual([ADDRESS]);
  });

  it("HTTP Allow on connect takes the ticket down after granting", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const released: string[] = [];
    const parked = Promise.withResolvers<ApprovalOutcome>();
    const ready = Promise.withResolvers<AskInput>();
    const session = sessionOf(store);
    const requests = new WalletRequests({
      appOrigin: APP_ORIGIN,
      ask: async (_userId, card) => {
        ready.resolve(card);
        return await parked.promise;
      },
      chainId: 8453,
      interactions: {
        resolve: (_userId, requestId, optionId) => {
          released.push(requestId);
          parked.resolve({
            accessToken: "token",
            kind: "answered",
            optionId,
          });
          return true;
        },
      },
      network: "eip155:8453",
      now: () => NOW,
      policies: null,
      privy: stubPrivyServer(),
      publish: () => {},
      reads,
      rpc,
      store,
      stubbed: true,
      workspace: () => ({ browser: fakeBrowser(bag), session }),
    });
    const observing = requests.observe(
      ALICE,
      observation("eth_requestAccounts", [])
    );
    const card = await ready.promise;
    const requestId = card.request.wallet?.requestId;
    if (requestId === undefined) {
      throw new Error("expected a wallet request id");
    }
    const view = await requests.fulfillApproved(ALICE, requestId);
    expect(view.status).toBe("confirmed");
    expect(released).toEqual([card.request.id]);
    await observing;
    expect(accountsResult(bag.replies[0])).toEqual([ADDRESS]);
  });

  it("stub-signs personal_sign and refuses to broadcast a transaction", async () => {
    const store = memoryStore();
    const bag = emptyBag();
    const requests = coordinator({
      browser: fakeBrowser(bag),
      session: sessionOf(store),
      store,
    });
    await requests.observe(ALICE, observation("eth_requestAccounts", []));
    bag.replies.length = 0;
    await requests.observe(
      ALICE,
      observation("personal_sign", ["0x6869", ADDRESS])
    );
    expect(stringResult(bag.replies[0])).toBe(`0x${"73".repeat(65)}`);
    bag.replies.length = 0;
    await requests.observe(
      ALICE,
      observation("eth_sendTransaction", [
        { data: "0x", from: ADDRESS, to: ADDRESS, value: "0x1" },
      ])
    );
    expect(bag.replies[0]).toMatchObject({
      error: { code: -32_603 },
      ok: false,
    });
    expect(
      bag.replies[0]?.ok === false && bag.replies[0].error.message
    ).toContain("stubbed");
  });
});
