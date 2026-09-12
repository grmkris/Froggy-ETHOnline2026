import { describe, expect, it } from "bun:test";

import { defaultAllowance, MandateId, SessionId, userId } from "@froggy/domain";
import type { AppServerMessage, WalletSummary } from "@froggy/protocol";
import type { AgentGrant, PersonPolicyRecord } from "@froggy/wallet";

import { AgentGrants } from "./grants";
import type { GrantDeps, GrantWorkspaces } from "./grants";

const ALICE = userId("did:privy:grants-test");
/** Mirrors the module's retry window; a change there should be felt here. */
const RETRY_WINDOW_MS = 60_000;
const WALLET = { address: "0xabc", id: "wallet-1" };

const SUMMARY: WalletSummary = {
  address: WALLET.address,
  agentNote: null,
  agentAllowance: null,
  agentPolicyId: null,
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
  totalUsdMicros: null,
  windowSpentUsdMicros: 0,
};

/** Lets the detached grant and publish settle. */
const flush = async (): Promise<void> => {
  await Bun.sleep(0);
  await Bun.sleep(0);
};

const harness = (
  answers: (() => Promise<AgentGrant>)[],
  ownPolicyId: string | null = null
) => {
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
        setAgentPolicy: (policy) => {
          calls.push(`policy:${policy?.policyId ?? "none"}`);
        },
        applyAllowance: (policy) => {
          calls.push(`allowance:${policy?.policyId ?? "none"}`);
          return {
            createdAt: 0,
            id: MandateId.generate(),
            rules: [],
            sessionId: SessionId.generate(),
          };
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
  const record = (): PersonPolicyRecord => ({
    allowance: defaultAllowance(clock),
    policyId: ownPolicyId ?? "",
  });
  const deps: GrantDeps = {
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
  };
  const grants = new AgentGrants(
    ownPolicyId === null
      ? deps
      : {
          ...deps,
          policies: {
            current: async () => await Promise.resolve(record()),
            ensure: async () => await Promise.resolve(record()),
          },
        }
  );
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
  return { attached: true, policyIds: [], reason: null, wallet: WALLET };
};

/** Privy has not linked the wallet yet: nothing to grant, and nothing refused. */
const noWalletYet = async (): Promise<AgentGrant> => {
  await Promise.resolve();
  return {
    attached: false,
    policyIds: [],
    reason: "No embedded wallet on this account yet.",
    wallet: null,
  };
};

const refused = async (): Promise<AgentGrant> => {
  await Promise.resolve();
  return {
    attached: false,
    policyIds: [],
    reason: "Privy said no.",
    wallet: WALLET,
  };
};

describe("AgentGrants", () => {
  it("asks once while in flight, and not again once the signer is attached", async () => {
    const h = harness([attached, attached]);
    h.grants.note(ALICE, "token");
    h.grants.note(ALICE, "token");
    // Flushed before counting: the person's policy is looked up before Privy is
    // asked, so the ask is a microtask later than the synchronous `note`. The
    // claim under test is unchanged — two notes must produce one ask.
    await flush();
    expect(h.asks()).toBe(1);
    expect(h.calls).toEqual([
      "addresses:0xabc",
      "wallet:wallet-1",
      "policy:none",
      "allowance:none",
      "signer:granted:",
    ]);
    h.advance(RETRY_WINDOW_MS * 10);
    h.grants.note(ALICE, "token");
    await flush();
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
      "policy:none",
      "allowance:none",
      "signer:absent:Privy said no.",
    ]);
    expect(h.published).toHaveLength(1);
    h.advance(RETRY_WINDOW_MS - 1);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(1);
    h.advance(1);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(2);
    expect(h.calls.at(-1)).toBe("signer:granted:");
  });

  it("asks again at once when the person granted the signer in the browser", async () => {
    const h = harness([refused, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(1);
    h.grants.refresh(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(2);
    expect(h.calls.at(-1)).toBe("signer:granted:");
  });

  it("reports a signer under the old shared policy as shared, not granted", async () => {
    // The migration state. The agent can sign either way, so the pane must not
    // call this done: the rules holding it are not the person's.
    const h = harness(
      [
        async () =>
          await Promise.resolve({
            attached: true,
            policyIds: ["the-app-wide-one"],
            reason: null,
            wallet: WALLET,
          }),
      ],
      "theirs"
    );
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls.at(-1)).toBe("signer:shared:");
  });

  it("treats a signer under a policy as granted when it is the person's own", async () => {
    const h = harness(
      [
        async () =>
          await Promise.resolve({
            attached: true,
            policyIds: ["theirs"],
            reason: null,
            wallet: WALLET,
          }),
      ],
      "theirs"
    );
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls.at(-1)).toBe("signer:granted:");
  });

  it("shows the wallet as soon as Privy links it, with no reload and no minute's wait", async () => {
    // The failure this encodes, from production on 10 Sep: Privy creates the
    // wallet in the browser a moment after our first authenticated request
    // looks for it. The look finding nothing is survivable; sharing a refusal's
    // sixty-second backoff was not, because a person who has just signed in and
    // is sitting still makes no further requests, so nothing ever looked again
    // and they watched an empty wallet page.
    const h = harness([noWalletYet, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls).toEqual([
      "policy:none",
      "allowance:none",
      "signer:absent:No embedded wallet on this account yet.",
    ]);

    // Seconds, not a minute.
    h.advance(3000);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.calls).toContain("addresses:0xabc");
    expect(h.calls.at(-1)).toBe("signer:granted:");
    expect(h.published.map((message) => message.type)).toContain(
      "wallet.state"
    );
  });

  it("does not ask again the instant it is told there is no wallet", async () => {
    // The window is real rather than zero: a busy tab must not turn "not yet"
    // into a request per page load.
    const h = harness([noWalletYet, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    h.advance(500);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(1);
  });

  it("still backs off a full minute from an actual refusal", async () => {
    // Two states, two windows. A refusal is worth waiting on; a wallet that is
    // about to exist is not, and collapsing them either hammers Privy or
    // strands the person.
    const h = harness([refused, attached]);
    h.grants.note(ALICE, "token");
    await flush();
    h.advance(RETRY_WINDOW_MS - 1);
    h.grants.note(ALICE, "token");
    await flush();
    expect(h.asks()).toBe(1);
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
    await flush();
    expect(h.asks()).toBe(2);
  });
});
