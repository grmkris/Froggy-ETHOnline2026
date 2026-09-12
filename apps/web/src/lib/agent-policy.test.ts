import { afterEach, expect, spyOn, test } from "bun:test";

import { attachAgentSigner, signerGrantWords } from "./agent-policy";

const originalFetch = globalThis.fetch;
const requests: string[] = [];
const mockFetch = (): void => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      requests.push(String(input));
      return await Promise.resolve(Response.json({ ok: true }));
    }, originalFetch)
  );
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  requests.length = 0;
});

const base = {
  address: "0xwallet",
  chosen: null,
  getToken: async () => await Promise.resolve("token"),
  policyId: "policy-mine",
  sign: null,
  signerId: "quorum-agent",
};

test("a move asks Privy to replace, and a plain grant does not", async () => {
  mockFetch();
  const asked: boolean[] = [];
  const grant = async (request: { readonly replace: boolean }) => {
    asked.push(request.replace);
    return await Promise.resolve({ kind: "granted" as const });
  };
  await attachAgentSigner({ ...base, grant, replace: true });
  await attachAgentSigner({ ...base, grant, replace: false });
  expect(asked).toEqual([true, false]);
  // The server reads the wallet back after each one.
  expect(requests).toEqual([
    "/api/agent-signer/refresh",
    "/api/agent-signer/refresh",
  ]);
});

test("a refusal after the removal is reported as half-moved, and the pane is refreshed", async () => {
  mockFetch();
  const result = await attachAgentSigner({
    ...base,
    grant: async () =>
      await Promise.resolve({
        kind: "refused" as const,
        reason: "The person closed the prompt.",
        removed: true,
      }),
    replace: true,
  });
  expect(result).toEqual({
    kind: "half-moved",
    reason: "The person closed the prompt.",
  });
  expect(requests).toEqual(["/api/agent-signer/refresh"]);
  expect(signerGrantWords(result)).toContain("Press again to attach them");
});

test("a refusal before anything changed refreshes nothing", async () => {
  mockFetch();
  const result = await attachAgentSigner({
    ...base,
    grant: async () =>
      await Promise.resolve({
        kind: "refused" as const,
        reason: "Duplicate signer(s) provided when updating wallet.",
        removed: false,
      }),
    replace: false,
  });
  expect(result.kind).toBe("refused");
  expect(requests).toEqual([]);
  expect(signerGrantWords(result)).toBe(
    "Privy refused: Duplicate signer(s) provided when updating wallet."
  );
});
