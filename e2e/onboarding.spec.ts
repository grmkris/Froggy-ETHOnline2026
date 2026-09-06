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
  test(`wallet starts in view at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize(viewport);
    await page.goto("/");
    const wallet = page.getByRole("region", { name: "Wallet", exact: true });
    await expect(wallet.getByText("$0.50", { exact: true })).toBeVisible();
    await expect(
      wallet.getByRole("heading", { name: "Your wallet" })
    ).toBeInViewport();
    await expect(
      wallet.getByRole("button", { name: "Connect an agent" })
    ).toBeInViewport();
    await expect(wallet.getByText("Total unavailable")).toBeVisible();
    await expect(
      page
        .getByLabel("Spending against the rolling cap")
        .locator('[data-slot="progress-track"]')
    ).toHaveCount(1);
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

test("Connect opens Agents directly, retains setup and restores focus", async ({
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
  await page.goto("/");
  const connect = page.getByRole("button", {
    name: "Connect an agent",
    exact: true,
  });
  await connect.click();
  await expect(
    page.getByRole("tab", { name: "Agents", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Agent name").fill("My agent");
  await page.getByRole("button", { name: "Create connection" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t create the connection"
  );
  await page.getByRole("button", { name: "Retry connection" }).click();
  const skill = page.getByLabel("Skill for your agent");
  await expect(skill).toHaveValue(/FROGGY_TOKEN="fgy_/u);
  const issued = await skill.inputValue();
  await expect(
    page.getByText("Waiting for first use", { exact: false })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(connect).toBeFocused();
  await connect.click();
  await expect(skill).toHaveValue(issued);
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
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect an agent", exact: true })
    .click();
  await page.getByRole("button", { name: "Create connection" }).click();
  await expect(page.getByLabel("Skill for your agent")).toBeVisible();
  await page.getByRole("button", { name: "Copy agent skill" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn’t copy");
  await expect(page.getByLabel("Skill for your agent")).toHaveValue(
    /FROGGY_TOKEN="fgy_/u
  );
  await expect(
    page.getByRole("button", { name: "Copy agent skill" })
  ).toBeEnabled();
});

test("funding explains the local identity and validates a chosen amount", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add funds", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Fund your next task" })
  ).toBeVisible();
  await expect(
    page.getByText("This is a local identity.", { exact: false })
  ).toBeVisible();
  await page.getByLabel("Amount in USDC").fill("-1");
  await expect(
    page.getByRole("button", { name: "Request task credit" })
  ).toBeDisabled();
  await page.getByLabel("Amount in USDC").fill("0.75");
  await expect(
    page.getByText("0.75 USDC on Base Sepolia", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request task credit" })
  ).toBeEnabled();
});

test("reduced motion leaves the drawer and financial values stationary", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect an agent", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Your agents", exact: true });
  await expect(drawer).toBeVisible();
  expect(
    await drawer.evaluate(
      (element) => getComputedStyle(element).transitionProperty
    )
  ).toBe("opacity");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Connect an agent", exact: true })
  ).toBeFocused();
});

interface BalanceUpdate {
  send?: (units: string) => void;
}

test("late wallet balances keep actions stable and funding requests persist", async ({
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
              balances: { ...event.wallet.balances, usdcUnits: units },
            },
          })
        );
      };
      balanceUpdate.send("0");
    });
  });
  await page.goto("/");
  const wallet = page.getByRole("region", { name: "Wallet", exact: true });
  await expect(wallet.getByText("$0.00", { exact: true })).toHaveCount(3);
  await wallet.getByRole("button", { name: "Add funds", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Request task credit" })
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  const scroll = page.locator('[data-slot="wallet-home-scroll"]');
  const before = await scroll.evaluate((node) => node.scrollTop);
  balanceUpdate.send?.("1000000");
  await expect(
    wallet.getByRole("button", { name: "Add task credit" })
  ).toBeVisible();
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(before);
  await wallet.getByRole("button", { name: "Connect an agent" }).click();
  await expect(page.getByRole("tab", { name: "Agents" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.keyboard.press("Escape");
  await wallet.getByRole("button", { name: "Add task credit" }).click();
  await page.getByLabel("Amount in USDC").fill("9.00");
  await expect(
    page.getByRole("button", { name: "Request task credit" })
  ).toBeDisabled();
  await page.getByLabel("Amount in USDC").fill("0.50");
  let requests = 0;
  await page.route("**/api/chat", async (route) => {
    requests += 1;
    await route.fulfill({ status: 503 });
  });
  await page.getByRole("button", { name: "Request task credit" }).click();
  await expect(
    page.getByText("Top-up requested", { exact: true })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open wallet" }).click();
  await page.getByRole("button", { name: "Add task credit" }).click();
  await expect(
    page.getByText("Top-up requested", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Amount in USDC")).toBeDisabled();
  expect(requests).toBe(1);
});
