import { describe, expect, it } from "bun:test";

import { defaultAllowance, userId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import type { PersonPolicyRecord } from "@froggy/wallet";

import { PersonPolicies, signerStanding } from "./person-policies";
import type { PersonPolicyDeps } from "./person-policies";

const ALICE = userId("did:privy:person-policy-test");
const NOW = 1_789_000_000_000;

const PINS = {
  chainId: "8453",
  servicePayee: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
  treasury: "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  vaultId: null,
};

const harness = (
  answers: (() => Promise<{ policyId: string | null; reason: string | null }>)[]
) => {
  const saved = new Map<UserId, PersonPolicyRecord>();
  let mints = 0;
  const deps: PersonPolicyDeps = {
    now: () => NOW,
    pins: PINS,
    privy: {
      mintPolicy: async () => {
        const answer = answers[mints];
        mints += 1;
        if (answer === undefined) {
          throw new Error("no answer scripted");
        }
        return await answer();
      },
    },
    store: {
      privyPolicy: {
        clear: async (id) => {
          await Promise.resolve();
          saved.delete(id);
        },
        expiringBefore: async (at) => {
          await Promise.resolve();
          return [...saved.entries()]
            .filter(([, record]) => record.allowance.expiresAt < at)
            .map(([id]) => id);
        },
        load: async (id) => await Promise.resolve(saved.get(id) ?? null),
        save: async (id, record) => {
          await Promise.resolve();
          saved.set(id, record);
        },
      },
    },
  };
  return { mints: () => mints, policies: new PersonPolicies(deps), saved };
};

const minted = (policyId: string) => async () =>
  await Promise.resolve({ policyId, reason: null });

describe("PersonPolicies", () => {
  it("mints once and remembers, so a second device does not mint again", async () => {
    const h = harness([minted("pol_1"), minted("pol_2")]);
    const first = await h.policies.ensure(ALICE);
    expect(first?.policyId).toBe("pol_1");
    const second = await h.policies.ensure(ALICE);
    expect(second?.policyId).toBe("pol_1");
    expect(h.mints()).toBe(1);
  });

  it("mints once when two tabs race a cold start", async () => {
    // Nothing is stored yet when the second caller arrives, so the store check
    // cannot catch this one; the in-flight promise is what does.
    const h = harness([minted("pol_1"), minted("pol_2")]);
    const [a, b] = await Promise.all([
      h.policies.ensure(ALICE),
      h.policies.ensure(ALICE),
    ]);
    expect(a?.policyId).toBe("pol_1");
    expect(b?.policyId).toBe("pol_1");
    expect(h.mints()).toBe(1);
  });

  it("stores the numbers beside the id, because the mandate is built from them", async () => {
    const h = harness([minted("pol_1")]);
    const record = await h.policies.ensure(ALICE);
    expect(record?.allowance).toEqual(defaultAllowance(NOW));
  });

  it("reports no policy when Privy refuses, and tries again next time", async () => {
    const h = harness([
      async () =>
        await Promise.resolve({ policyId: null, reason: "Privy said no." }),
      minted("pol_2"),
    ]);
    expect(await h.policies.ensure(ALICE)).toBeNull();
    // A refusal must not be remembered for the life of the process: the next
    // request is a real retry.
    expect(await h.policies.ensure(ALICE)).not.toBeNull();
    expect(h.mints()).toBe(2);
  });

  it("does not mint merely to answer what the person currently has", async () => {
    const h = harness([minted("pol_1")]);
    expect(await h.policies.current(ALICE)).toBeNull();
    expect(h.mints()).toBe(0);
  });
});

describe("the expiry nudge", () => {
  const DAY = 86_400_000;

  const withPolicy = async (expiresAt: number) => {
    const h = harness([minted("pol_1")]);
    await h.policies.ensure(ALICE, {
      ...defaultAllowance(NOW),
      expiresAt,
    });
    return h;
  };

  it("says nothing while the expiry is far off", async () => {
    const h = await withPolicy(NOW + 10 * DAY);
    expect(await h.policies.dueForNudge(NOW)).toEqual([]);
  });

  it("warns once inside the three-day window", async () => {
    const h = await withPolicy(NOW + 2 * DAY);
    const due = await h.policies.dueForNudge(NOW);
    expect(due).toHaveLength(1);
    expect(due[0]?.userId).toBe(ALICE);
    expect(due[0]?.text).toContain("in 2 days");
  });

  it("does not repeat itself on the next tick a minute later", async () => {
    // The tick runs every minute; a warning every minute is not a warning.
    const h = await withPolicy(NOW + 2 * DAY);
    expect(await h.policies.dueForNudge(NOW)).toHaveLength(1);
    expect(await h.policies.dueForNudge(NOW + 60_000)).toEqual([]);
  });

  it("says it again the next day, while it is still true", async () => {
    const h = await withPolicy(NOW + 2 * DAY);
    expect(await h.policies.dueForNudge(NOW)).toHaveLength(1);
    expect(await h.policies.dueForNudge(NOW + DAY)).toHaveLength(1);
  });

  it("speaks plainly on the last day and after it has gone", async () => {
    const today = await withPolicy(NOW + 3_600_000);
    const todayDue = await today.policies.dueForNudge(NOW);
    expect(todayDue[0]?.text).toContain("runs out today");
    const gone = await withPolicy(NOW - DAY);
    const goneDue = await gone.policies.dueForNudge(NOW);
    expect(goneDue[0]?.text).toContain("has run out");
  });

  it("says nothing for somebody with no policy of their own", async () => {
    const h = harness([]);
    expect(await h.policies.dueForNudge(NOW)).toEqual([]);
  });
});

describe("signerStanding", () => {
  it("is absent with no signer", () => {
    expect(
      signerStanding({
        attached: false,
        ownPolicyId: "mine",
        perPerson: true,
        policyIds: [],
      })
    ).toBe("absent");
  });

  it("is granted when the signer is under the person's own policy", () => {
    expect(
      signerStanding({
        attached: true,
        ownPolicyId: "mine",
        perPerson: true,
        policyIds: ["mine"],
      })
    ).toBe("granted");
  });

  it("is shared when the signer is under some other policy", () => {
    // Everybody who granted before per-person policies existed. The agent can
    // sign either way, so calling this `granted` would be true and would hide
    // the one thing the person can act on.
    expect(
      signerStanding({
        attached: true,
        ownPolicyId: "mine",
        perPerson: true,
        policyIds: ["the-app-wide-one"],
      })
    ).toBe("shared");
  });

  it("is shared when the person's own policy could not be minted", () => {
    expect(
      signerStanding({
        attached: true,
        ownPolicyId: null,
        perPerson: true,
        policyIds: ["the-app-wide-one"],
      })
    ).toBe("shared");
  });

  it("is shared when a signer carries no policy override at all", () => {
    // Not `granted`: an empty override means the agent signs under whatever the
    // wallet's own policy is, which is nothing this person chose.
    expect(
      signerStanding({
        attached: true,
        ownPolicyId: "mine",
        perPerson: true,
        policyIds: [],
      })
    ).toBe("shared");
  });

  it("is simply granted where no per-person policies are minted", () => {
    // The regression this guards: a deployment that mints none has nothing to
    // migrate to, so putting "set your own rules" on its screens would be a
    // call to action nobody could answer.
    expect(
      signerStanding({
        attached: true,
        ownPolicyId: null,
        perPerson: false,
        policyIds: ["the-app-wide-one"],
      })
    ).toBe("granted");
  });
});
