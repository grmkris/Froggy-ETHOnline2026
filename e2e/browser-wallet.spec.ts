import { expect, test } from "@playwright/test";

import { WalletConnectionId, WalletRequestId } from "../packages/domain/src/id";

/**
 * The injected-wallet surfaces against a stubbed server: connected sites on
 * Connections, and a dapp card that Allows through prepare/commit rather than
 * the spend socket.
 */

test("Connections lists connected sites and can revoke one", async ({
  page,
}) => {
  const id = WalletConnectionId.generate();
  let revoked = false;
  await page.route("**/api/wallet-connections", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        connections: revoked
          ? []
          : [
              {
                address: "0x00000000000000000000000000000000000000aa",
                chainId: 8453,
                grantedAt: Date.now(),
                id,
                origin: "https://app.uniswap.org",
              },
            ],
      },
    });
  });
  await page.route(`**/api/wallet-connections/${id}`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    revoked = true;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto("/agents");
  const sites = page.getByRole("region", { name: "Connected sites" });
  await expect(sites).toBeVisible();
  await expect(sites.getByText("app.uniswap.org")).toBeVisible();
  await sites.getByRole("button", { name: "Revoke app.uniswap.org" }).click();
  await expect(sites.getByText("No sites connected yet.")).toBeVisible();
});

test("a wallet card Allows through prepare and commit", async ({ page }) => {
  const requestId = WalletRequestId.generate();
  const calls: string[] = [];
  await page.route("**/api/wallet-requests/*/prepare", async (route) => {
    calls.push("prepare");
    await route.fulfill({
      json: {
        expiry: Date.now() + 60_000,
        needsSignature: false,
        payload: {
          body: { rules: [] },
          headers: {
            "privy-app-id": "app",
            "privy-request-expiry": "0",
          },
          method: "PATCH",
          url: "https://api.privy.io/v1/policies/stub",
          version: 1,
        },
      },
    });
  });
  await page.route("**/api/wallet-requests/*/commit", async (route) => {
    calls.push("commit");
    await route.fulfill({
      json: {
        ok: true,
        request: {
          approvalId: null,
          chainId: 8453,
          createdAt: Date.now(),
          delivery: "delivered",
          error: null,
          expiresAt: Date.now() + 60_000,
          id: requestId,
          initiatedDuring: "human",
          kind: "connect",
          origin: "https://app.uniswap.org",
          status: "confirmed",
          stubbed: true,
          summary: ["app.uniswap.org wants to see your address."],
          title: "Connect this site",
          transactionHash: null,
          updatedAt: Date.now(),
        },
      },
    });
  });
  await page.routeWebSocket("**/ws/app", (socket) => {
    socket.onMessage((raw) => {
      const text = raw.toString();
      if (text.includes('"type":"ping"')) {
        socket.send(JSON.stringify({ v: 1, type: "pong", sentAt: Date.now() }));
      }
    });
    socket.send(
      JSON.stringify({
        v: 1,
        type: "approval.request",
        request: {
          amountLabel: "Connect",
          detail: "app.uniswap.org wants to see your address.",
          expiresAt: Date.now() + 60_000,
          id: "apr_wallet_e2e",
          options: [
            { id: "deny_stop", kind: "deny_stop", label: "Stop the agent" },
            { id: "deny", kind: "deny", label: "Not this time" },
            { id: "allow_once", kind: "allow_once", label: "Allow once" },
          ],
          payeeLabel: "app.uniswap.org",
          purpose: "Connect this site",
          title: "Connect this site",
          wallet: {
            chainId: 8453,
            initiatedDuring: "human",
            kind: "connect",
            lines: ["app.uniswap.org wants to see your address."],
            needsSignature: false,
            origin: "https://app.uniswap.org",
            requestId,
            warnings: [],
          },
        },
      })
    );
  });

  await page.goto("/chat");
  const ticket = page.getByLabel("Connect this site");
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await expect(ticket.getByText("app.uniswap.org")).toBeVisible();
  await expect(ticket.getByText("Base", { exact: false })).toBeVisible();
  await ticket.getByRole("button", { name: "Allow once" }).click();
  await expect.poll(() => calls.join(",")).toBe("prepare,commit");
});
