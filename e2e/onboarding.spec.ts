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
      page.getByRole("region", { name: "Platform credits", exact: true })
    ).toBeVisible();
    await wallet.scrollIntoViewIfNeeded();
    await expect(
      wallet.getByRole("heading", { name: "Your wallet" })
    ).toBeInViewport();
    await expect(
      wallet.getByRole("button", { name: "Add funds", exact: true })
    ).toBeInViewport();
    // The stub knows no USDC balance: the total is unavailable, not zero.
    await expect(wallet.getByText("Total unavailable")).toBeVisible();
    await expect(wallet.getByText("balance unavailable (stub)")).toBeVisible();
    await expect(
      wallet.getByRole("list", { name: "Stubbed integrations" })
    ).toBeVisible();
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

test("Advanced agent setup is recoverable", async ({ page }) => {
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
  await page.goto("/agents");
  await expect(page).toHaveURL(/\/agents$/u);
  await page.getByText("Advanced: connect with a token").click();
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
  await page.getByText("Advanced: connect with a token").click();
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
  // Without a Privy sign-in there is no deposit flow to open, so the dialog
  // must not offer one rather than opening a window that cannot work.
  await expect(
    dialog.getByRole("button", { name: "Choose a chain and token" })
  ).toHaveCount(0);
});

interface BalanceUpdate {
  send?: (units: string) => void;
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`rapid balance updates settle without moving the page (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
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
    balanceUpdate.send?.("2000000");
    balanceUpdate.send?.("3000000");
    await expect(
      wallet.getByText("$3.00", { exact: true }).first()
    ).toBeVisible();
    await expect(wallet.getByText("$1.00", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
  });
}

test("wallet and activity load without showing false empty or unavailable states", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const backfill = Promise.withResolvers<null>();
  const wallet = Promise.withResolvers<() => void>();
  await page.route("**/api/receipts", async (route) => {
    await backfill.promise;
    await route.fulfill({ json: { receipts: [] } });
  });
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag === "Success" &&
        decoded.success.type === "wallet.state"
      ) {
        wallet.resolve(() => {
          socket.send(message);
        });
      } else {
        socket.send(message);
      }
    });
  });
  try {
    await page.goto("/wallet");
    await expect(page.getByLabel("Loading wallet balance")).toBeVisible();
    await expect(page.getByLabel("Loading wallet activity")).toBeVisible();
    await expect(
      page.getByText("Total unavailable", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByText("Nothing spent or refused yet.")).toHaveCount(
      0
    );
    await expect(
      page
        .getByLabel("Loading wallet balance")
        .locator('[data-slot="skeleton"]')
    ).toHaveCSS("animation-name", "none");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page
      .getByRole("button", { name: "Add funds", exact: true })
      .scrollIntoViewIfNeeded();
    const activity = page.getByRole("heading", {
      name: "Activity",
      exact: true,
    });
    const activityBefore = await activity.boundingBox();
    await page.screenshot({
      path: testInfo.outputPath("wallet-loading-mobile.png"),
    });
    await page.getByRole("button", { name: "Add funds", exact: true }).click();
    await expect(page.getByLabel("Loading funding details")).toBeVisible();
    const deliverWallet = await wallet.promise;
    deliverWallet();
    await expect(page.getByLabel("Loading funding details")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText(
      "This is a local identity"
    );
    await page.keyboard.press("Escape");
    expect(await activity.boundingBox()).toEqual(activityBefore);
    backfill.resolve(null);
    await expect(page.getByLabel("Loading wallet activity")).toHaveCount(0);
    await expect(page.getByText("Nothing spent or refused yet.")).toBeVisible();
  } finally {
    backfill.resolve(null);
  }
});
