import { describe, expect, it } from "bun:test";

import { userId } from "@froggy/domain";
import type { AppServerMessage, WalletSummary } from "@froggy/protocol";
import type { AgentGrant } from "@froggy/wallet";

import { AgentGrants } from "./grants";
import type { GrantWorkspaces } from "./grants";

const ALICE = userId("did:privy:grants-test");
/** Mirrors the module's retry window; a change there should be felt here. */
const RETRY_WINDOW_MS = 60_000;
const WALLET = { address: "0xabc", id: "wallet-1" };

const SUMMARY: WalletSummary = {
  address: WALLET.address,
  agentNote: null,
  agentSigner: "absent",
  balanceLabel: "—",
  balances: {
    evmNetwork: "eip155:8453",
    hbarTinybars: null,
    hederaNetwork: "hedera:mainnet",
    usdMicrosPerHbar: null,
    usdcUnits: "0",
  },
  hederaAccountId: null,
  ledgerNote: null,
  pocketUsdMicros: 0,
  signerAddress: WALLET.address,
  windowSpentUsdMicros: 0,
};

/** Lets the detached grant and publish settle. */
const flush = async (): Promise<void> => {
  await Bun.sleep(0);
  await Bun.sleep(0);
};

const harness = (answers: (() => Promise<AgentGrant>)[]) => {
  const calls: string[] = [];
  const published: AppServerMessage[] = [];
  let asks = 0;
  let clock = 1000;
  const workspaces: GrantWorkspaces = {
    for: () => ({
      session: {
        setAddresses: (addresses) => {
          calls.push(`addresses:${addresses.signer ?? "none"}`);
        },
        setAgentSigner: (state, note) => {
          calls.push(`signer:${state}:${note ?? ""}`);
        },
        setWallet: (wallet) => {
          calls.push(`wallet:${wallet?.id ?? "none"}`);
        },
        walletSummary: async () => {
          await Promise.resolve();
          return SUMMARY;
        },
      },
    }),
  };
  const grants = new AgentGrants({
    now: () => clock,
    privy: {
      grantAgent: async () => {
        const answer = answers[asks];
        asks += 1;
        if (answer === undefined) {
          throw new Error("no answer scripted");
        }
        return await answer();
      },
    },
    publishApp: (_, message) => {
      published.push(message);
    },
    workspaces,
  });
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    asks: () => asks,
    calls,
    grants,
    published,
  };
};

const attached = async (): Promise<AgentGrant> => {
  await Promise.resolve();
  return { attached: true, reason: null, wallet: WALLET };
};

const refused = async (): Promise<AgentGrant> => {
  await Promise.resolve();
  return { attached: false, reason: "Privy said no.", wallet: WALLET };
};

describe("AgentGrants", () => {
  it("asks once while in flight, and not again once the signer is attached", async () => {
    const h = harness([attached, attached]);
    h.grants.note(ALICE, "token");
    h.grants.note(ALICE, "token");
    expect(h.asks()).toBe(1);
    await flush();
    expect(h.calls).toEqual([
      "addresses:0xabc",
      "wallet:wallet-1",
      "signer:granted:",
    ]);
    h.advance(RETRY_WINDOW_MS * 10);
    h.grants.note(ALICE, "token");
    expect(h.asks()).toBe(1);
    expect(h.published.map((message) => message.type)).toEqual([
      "wallet.state",
    ]);
  });

  it("keeps the wallet when the signer does not attach, and asks again after the retry window", async () => {
    const h = harness([refused, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls).toEqual([
      "addresses:0xabc",
      "wallet:wallet-1",
      "signer:absent:Privy said no.",
    ]);
    expect(h.published).toHaveLength(1);
    h.advance(RETRY_WINDOW_MS - 1);
    h.grants.note(ALICE, "token");
    expect(h.asks()).toBe(1);
    h.advance(1);
    h.grants.note(ALICE, "token");
    expect(h.asks()).toBe(2);
    await flush();
    expect(h.calls.at(-1)).toBe("signer:granted:");
  });

  it("asks again at once when the person granted the signer in the browser", async () => {
    const h = harness([refused, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(1);
    h.grants.refresh(ALICE, "token");
    expect(h.asks()).toBe(2);
    await flush();
    expect(h.calls.at(-1)).toBe("signer:granted:");
  });

  it("treats a grant that threw as a refusal to retry, and touches nothing", async () => {
    const h = harness([
      async () => {
        await Promise.resolve();
        throw new Error("Privy is down.");
      },
      attached,
    ]);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls).toEqual([]);
    expect(h.published).toEqual([]);
    h.advance(RETRY_WINDOW_MS);
    h.grants.note(ALICE, "token");
    expect(h.asks()).toBe(2);
  });
});
