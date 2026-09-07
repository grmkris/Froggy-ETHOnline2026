import { expect, test } from "@playwright/test";

import {
  decodeAppServerMessage,
  encodeAppServerMessage,
} from "../packages/protocol/src/app";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`the wallet reads as one balance at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize(viewport);
    await page.goto("/wallet");
    const wallet = page.getByRole("region", { name: "Wallet", exact: true });
    await expect(
      wallet.getByRole("heading", { name: "Your wallet" })
    ).toBeInViewport();
    await expect(
      wallet.getByRole("link", { name: "Connect an agent" })
    ).toBeInViewport();
    // The stub knows no USDC balance: the total is unavailable, not zero.
    await expect(wallet.getByText("Total unavailable")).toBeVisible();
    await wallet.getByText("Where it is").click();
    await expect(
      wallet.getByText("Unavailable", { exact: true })
    ).toBeVisible();
    // What the stub holds for Hedera payments is shown, never hidden.
    await expect(wallet.getByText("$0.50", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("wallet.png") });
    if (viewport.width === 1440) {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test("Connect an agent leads to the Agents page, where setup is recoverable", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/agents", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        json: { error: "temporarily unavailable" },
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/wallet");
  await page.getByRole("link", { name: "Connect an agent" }).click();
  await expect(page).toHaveURL(/\/agents$/u);
  await page.getByLabel("Agent name").fill("My agent");
  await page.getByRole("button", { name: "Create connection" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t create the connection"
  );
  await page.getByRole("button", { name: "Retry connection" }).click();
  const skill = page.getByLabel("Skill for your agent");
  await expect(skill).toHaveValue(/froggy-cli\.js/u);
  await expect(
    page.getByText("Waiting for first use", { exact: false })
  ).toBeVisible();
  await page.getByRole("button", { name: "I pasted it" }).click();
  await expect(skill).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("clipboard denial is recoverable and does not discard the skill", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          await Promise.reject(new Error("denied"));
        },
      },
    });
  });
  await page.goto("/agents");
  await page.getByRole("button", { name: "Create connection" }).click();
  await expect(page.getByLabel("Skill for your agent")).toBeVisible();
  await page.getByRole("button", { name: "Copy agent skill" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t copy");
  await expect(page.getByLabel("Skill for your agent")).toHaveValue(
    /froggy-cli\.js/u
  );
  await expect(
    page.getByRole("button", { name: "Copy agent skill" })
  ).toBeEnabled();
});

test("adding funds explains the local identity instead of opening an onramp", async ({
  page,
}) => {
  await page.goto("/wallet");
  await page.getByRole("button", { name: "Add funds", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add funds" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("This is a local identity.", { exact: false })
  ).toBeVisible();
  await expect(page.getByLabel("Amount in USDC")).toHaveCount(0);
});

interface BalanceUpdate {
  send?: (units: string) => void;
}

test("a late balance changes the total without moving the page", async ({
  page,
}) => {
  const balanceUpdate: BalanceUpdate = {};
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag !== "Success" ||
        decoded.success.type !== "wallet.state"
      ) {
        socket.send(message);
        return;
      }
      const event = decoded.success;
      balanceUpdate.send = (units: string): void => {
        socket.send(
          encodeAppServerMessage({
            ...event,
            wallet: {
              ...event.wallet,
              pocketUsdMicros: 0,
              totalUsdMicros: null,
              balances: { ...event.wallet.balances, usdcUnits: units },
            },
          })
        );
      };
      balanceUpdate.send("0");
    });
  });
  await page.goto("/wallet");
  const wallet = page.getByRole("region", { name: "Wallet", exact: true });
  // The total, the USDC row and the HBAR row all read zero; the total is first.
  await expect(
    wallet.getByText("$0.00", { exact: true }).first()
  ).toBeVisible();
  const scroll = page.locator('[data-slot="wallet-home-scroll"]');
  const before = await scroll.evaluate((node) => node.scrollTop);
  balanceUpdate.send?.("1000000");
  await expect(
    wallet.getByText("$1.00", { exact: true }).first()
  ).toBeVisible();
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
});
