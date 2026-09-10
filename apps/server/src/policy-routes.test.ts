import { describe, expect, it } from "bun:test";

import { defaultAllowance, userId } from "@froggy/domain";
import type { Allowance } from "@froggy/domain";
import type { PersonPolicyRecord } from "@froggy/wallet";

import { handlePolicyRoutes } from "./policy-routes";
import type { PolicyRouteDeps } from "./policy-routes";

const ALICE = userId("did:privy:policy-route-alice");
const BOB = userId("did:privy:policy-route-bob");
const NOW = 1_789_000_000_000;

const PINS = {
  chainId: "8453",
  servicePayee: "0x79DC34E41B2b591078d3dE222C43EcaaBD52FcCB",
  treasury: "0x8Cc232c9EB25b4b20ee448106858e3B6281708C2",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  vaultId: null,
};

const held = new Map<string, PersonPolicyRecord>([
  [ALICE, { allowance: defaultAllowance(NOW), policyId: "pol_alice" }],
  [BOB, { allowance: defaultAllowance(NOW), policyId: "pol_bob" }],
]);

const deps = (overrides: Partial<PolicyRouteDeps> = {}): PolicyRouteDeps => ({
  appId: "app",
  appSecret: "secret",
  pins: PINS,
  policies: {
    adjust: async (id, allowance) =>
      await Promise.resolve({
        allowance,
        policyId: held.get(id)?.policyId ?? "",
      }),
    current: async (id) => await Promise.resolve(held.get(id) ?? null),
  },
  ...overrides,
});

/** The route answered, and this is what it said. Throws rather than casting. */
const bodyOf = async <T>(response: Response | null): Promise<T> => {
  if (response === null) {
    throw new Error("the route did not answer");
  }
  // SAFETY: the body is this route's own reply, shaped by `PolicyReply` two
  // files away, and every field a test reads is checked by the assertion that
  // follows rather than trusted here.
  return (await response.json()) as T;
};

const statusOf = (response: Response | null): number => {
  if (response === null) {
    throw new Error("the route did not answer");
  }
  return response.status;
};

interface Payload {
  readonly payload?: { readonly url?: string };
}

/**
 * What a test posts: a valid allowance, one with extra fields that must be
 * ignored, or a malformed one that must be refused.
 */
type Posted =
  | Allowance
  | (Allowance & { readonly policyId: string; readonly userId: string })
  | { readonly perSpendUsdMicros: string };

const prepare = async (
  who: typeof ALICE,
  body: Posted,
  routeDeps = deps()
): Promise<Response | null> =>
  await handlePolicyRoutes(
    routeDeps,
    new Request("http://localhost/api/agent-policy/prepare", {
      body: JSON.stringify(body),
      method: "POST",
    }),
    who,
    "/api/agent-policy/prepare"
  );

describe("preparing a policy change", () => {
  it("edits the signed-in person's policy and nothing else", async () => {
    // The property this route exists to keep. Alice's request names no policy
    // and no person; if it ever could, her signature would edit Bob's rules.
    const body = await bodyOf<Payload>(
      await prepare(ALICE, defaultAllowance(NOW))
    );
    expect(body.payload?.url).toContain("pol_alice");
    expect(body.payload?.url).not.toContain("pol_bob");
  });

  it("ignores a policy id smuggled into the body", async () => {
    const body = await bodyOf<Payload>(
      await prepare(ALICE, {
        ...defaultAllowance(NOW),
        policyId: "pol_bob",
        userId: BOB,
      })
    );
    expect(body.payload?.url).toContain("pol_alice");
  });

  it("refuses numbers that are not an allowance rather than sending them", async () => {
    expect(statusOf(await prepare(ALICE, { perSpendUsdMicros: "loads" }))).toBe(
      400
    );
  });

  it("says so plainly when the person has no policy of their own", async () => {
    const stranger = userId("did:privy:policy-route-nobody");
    const response = await handlePolicyRoutes(
      deps(),
      new Request("http://localhost/api/agent-policy/prepare", {
        body: JSON.stringify(defaultAllowance(NOW)),
        method: "POST",
      }),
      stranger,
      "/api/agent-policy/prepare"
    );
    expect(statusOf(response)).toBe(409);
    const body = await bodyOf<{ error?: string }>(response);
    expect(body.error).toContain("Grant the agent first");
  });

  it("says so plainly when this deployment mints no policies", async () => {
    expect(
      statusOf(
        await prepare(
          ALICE,
          defaultAllowance(NOW),
          deps({ pins: null, policies: null })
        )
      )
    ).toBe(409);
  });

  it("leaves paths it does not own alone", async () => {
    const response = await handlePolicyRoutes(
      deps(),
      new Request("http://localhost/api/agents", { method: "POST" }),
      ALICE,
      "/api/agents"
    );
    expect(response).toBeNull();
  });
});
