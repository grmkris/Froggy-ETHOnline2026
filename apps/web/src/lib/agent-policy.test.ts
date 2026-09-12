import { afterEach, expect, spyOn, test } from "bun:test";

import {
  attachAgentSigner,
  approveWalletRequest,
  signerGrantWords,
} from "./agent-policy";

const originalFetch = globalThis.fetch;
const requests: string[] = [];
const mockFetch = (): void => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      // A Request or URL would resolve against the test's origin; the path is
      // what the code under test sends and what these assert on.
      requests.push(
        new URL(input instanceof Request ? input.url : input, "http://froggy")
          .pathname
      );
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

test("approving a wallet request prepares, skips a signature, and commits", async () => {
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      const path = new URL(
        input instanceof Request ? input.url : input,
        "http://froggy"
      ).pathname;
      requests.push(path);
      if (path.endsWith("/prepare")) {
        return await Promise.resolve(
          Response.json({
            expiry: 1,
            needsSignature: false,
            payload: {
              body: { rules: [] },
              headers: {
                "privy-app-id": "app",
                "privy-request-expiry": "1",
              },
              method: "PATCH",
              url: "https://api.privy.io/v1/policies/stub",
              version: 1,
            },
          })
        );
      }
      return await Promise.resolve(Response.json({ ok: true }));
    }, originalFetch)
  );
  const result = await approveWalletRequest({
    requestId: "bwr_01walletrequest0000000001",
    sign: async () => await Promise.resolve("sig"),
    token: "token",
  });
  expect(result).toEqual({ kind: "allowed" });
  expect(requests).toEqual([
    "/api/wallet-requests/bwr_01walletrequest0000000001/prepare",
    "/api/wallet-requests/bwr_01walletrequest0000000001/commit",
  ]);
});
