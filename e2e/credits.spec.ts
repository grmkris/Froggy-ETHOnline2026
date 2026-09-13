import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { CreditPurchase } from "../packages/domain/src/credits";
import { CreditPurchaseId } from "../packages/domain/src/id";

const PurchaseInput = Schema.Struct({
  v: Schema.Literal(1),
  amountUsdMicros: Schema.Int,
  network: Schema.String,
  idempotencyKey: Schema.String,
});
const LimitsInput = Schema.Struct({
  v: Schema.Literal(1),
  perTaskUnits: Schema.Int,
  dailyUnits: Schema.Int,
});

const creditFixture = async (page: Page) => {
  let balance = 0;
  let purchase: typeof CreditPurchase.Type | null = null;
  let payments = 0;
  let limits = {
    perTaskUnits: 2_000_000,
    dailyUnits: 10_000_000,
    expiresAt: null,
    frozen: false,
  };
  const funding = [
    {
      network: "eip155:8453",
      label: "USDC on Base",
      asset: "USDC",
      payTo: "fixture-base-recipient",
      available: true,
      reason: null,
      stubbed: true,
    },
    {
      network: "hedera:testnet",
      label: "HBAR on Hedera testnet",
      asset: "0.0.0",
      payTo: "0.0.123",
      available: true,
      reason: null,
      stubbed: true,
    },
  ];
  await page.route("**/api/credits**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/credits") {
      await route.fulfill({
        json: {
          v: 1,
          availableUnits: balance,
          reservedUnits: 0,
          spentUnits: 0,
          limits,
          funding,
          stubbed: true,
        },
      });
      return;
    }
    if (path === "/api/credits/activity") {
      await route.fulfill({
        json: {
          v: 1,
          entries: [],
          purchases: purchase === null ? [] : [purchase],
        },
      });
      return;
    }
    if (path === "/api/credits/limits") {
      const input = Schema.decodeUnknownSync(LimitsInput)(
        route.request().postDataJSON()
      );
      limits = {
        ...limits,
        perTaskUnits: input.perTaskUnits,
        dailyUnits: input.dailyUnits,
      };
      await route.fulfill({ json: { v: 1, limits } });
      return;
    }
    if (path === "/api/credits/purchases") {
      const input = Schema.decodeUnknownSync(PurchaseInput)(
        route.request().postDataJSON()
      );
      purchase = Schema.decodeUnknownSync(CreditPurchase)({
        v: 1,
        id: CreditPurchaseId.generate(),
        status: "quoted",
        creditUnits: input.amountUsdMicros,
        network: input.network,
        asset: input.network.startsWith("hedera:") ? "0.0.0" : "USDC",
        amount: input.network.startsWith("hedera:")
          ? "123456789"
          : String(input.amountUsdMicros),
        payTo: "fixture-platform-recipient",
        expiresAt: Date.now() + 300_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transactionId: null,
        error: null,
        stubbed: true,
      });
      await route.fulfill({ json: purchase });
      return;
    }
    if (path.endsWith("/pay") && purchase !== null) {
      payments += 1;
      purchase = { ...purchase, status: "pending" };
      await route.fulfill({ json: purchase });
      return;
    }
    await route.fulfill({ json: purchase });
  });
  return {
    get payments() {
      return payments;
    },
    get limits() {
      return limits;
    },
    confirm: () => {
      if (purchase !== null) {
        balance = purchase.creditUnits;
        purchase = { ...purchase, status: "confirmed" };
      }
    },
  };
};

test("credits are separate from wallet funds and have independent caps", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const fixture = await creditFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  const credits = page.getByRole("region", {
    name: "Platform credits",
    exact: true,
  });
  await expect(credits.locator('[data-slot="credit-total"]')).toHaveText("0");
  await expect(
    credits.getByText("Start with free conversation", { exact: false })
  ).toBeVisible();
  await credits.getByText("Credit limits", { exact: true }).click();
  await page.getByLabel("Most per task (credits)").fill("150");
  await page.getByLabel("Most in 24 hours (credits)").fill("600");
  await page.getByRole("button", { name: "Save credit limits" }).click();
  await expect(page.getByText("Credit limits saved.")).toBeVisible();
  expect(fixture.limits.perTaskUnits).toBe(1_500_000);
  expect(fixture.limits.dailyUnits).toBe(6_000_000);
  await expect(
    page.getByRole("heading", { name: "Your wallet" })
  ).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(errors).toEqual([]);
});

for (const network of ["eip155:8453", "hedera:testnet"]) {
  test(`review ${network} purchase and recover pending payment after reload`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    const fixture = await creditFixture(page);
    await page.goto("/wallet");
    await page
      .getByRole("button", { name: "Buy credits", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Buy credits" });
    await dialog.getByRole("button", { name: "Custom", exact: true }).click();
    await dialog.getByLabel("Amount in USD").fill("1.01");
    await dialog.getByLabel("Pay with").selectOption(network);
    await dialog.getByRole("button", { name: "Review purchase" }).click();
    const confirmation = network.startsWith("hedera:")
      ? "Confirm · 1.23456789 HBAR"
      : "Confirm · 1.01 USDC";
    await expect(
      dialog.getByRole("button", { name: confirmation })
    ).toBeVisible();
    expect(fixture.payments).toBe(0);
    await dialog.getByRole("button", { name: confirmation }).click();
    await expect(
      dialog.getByText("Payment is confirming", { exact: true })
    ).toBeVisible();
    expect(fixture.payments).toBe(1);
    await page.reload();
    await page
      .getByRole("button", { name: "Buy credits", exact: true })
      .click();
    await expect(
      dialog.getByText("Payment is confirming", { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Confirm ·/u })
    ).toHaveCount(0);
    fixture.confirm();
    await expect(
      dialog.getByText("Credits added", { exact: true })
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator('[data-slot="credit-total"]')).toHaveText("101");
    expect(fixture.payments).toBe(1);
    expect(errors).toEqual([]);
  });
}

const runPrepaidSearch = async (page: Page, prompt: string) => {
  await page.goto("/services?service=web_search");
  const form = page.getByRole("form", { name: "Request Search the web" });
  await form.getByRole("textbox").fill(prompt);
  await form.getByRole("button", { name: "Try simulated · 1 credit" }).click();
  await expect(
    page.getByText("1 credit used", { exact: true }).first()
  ).toBeVisible();
};

test("one real local funding flow covers two services and survives reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  let toolWalletPayments = 0;
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/wallet/pay") {
      toolWalletPayments += 1;
    }
  });
  await page.goto("/wallet");
  await expect(page.locator('[data-slot="credit-total"]')).toHaveText("0");
  await page.getByRole("button", { name: "Buy credits", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buy credits" });
  await dialog.getByText("Need funds in your wallet?", { exact: true }).click();
  await dialog
    .getByRole("button", { name: "Get HBAR receiving address" })
    .click();
  await expect(dialog.getByLabel("Your HBAR receiving address")).toHaveValue(
    /.+/u
  );
  await expect(
    dialog.getByText("This is a simulated receiving address.", { exact: false })
  ).toBeVisible();
  await dialog.getByText("Need funds in your wallet?", { exact: true }).click();
  await dialog.getByRole("button", { name: "Custom", exact: true }).click();
  await dialog.getByLabel("Amount in USD").fill("1");
  await dialog.getByLabel("Pay with").selectOption("hedera:testnet");
  await dialog.getByRole("button", { name: "Review purchase" }).click();
  await dialog.getByRole("button", { name: /^Confirm · .* HBAR$/u }).click();
  await expect(
    dialog.getByText("Credits added", { exact: true })
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[data-slot="credit-total"]')).toHaveText("100");
  await runPrepaidSearch(page, "First prepaid search");
  await runPrepaidSearch(page, "Second prepaid search");
  await page.goto("/wallet");
  await expect(page.locator('[data-slot="credit-total"]')).toHaveText("98");
  await page.reload();
  await expect(page.locator('[data-slot="credit-total"]')).toHaveText("98");
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const headers = { authorization: `Bearer ${token}` };
  const activity = await page.request.get("/api/credits/activity", { headers });
  const result = Schema.decodeUnknownSync(
    Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({
          kind: Schema.String,
          units: Schema.Int,
          stubbed: Schema.Boolean,
        })
      ),
      purchases: Schema.Array(CreditPurchase),
    })
  )(await activity.json());
  expect(
    result.entries.filter((entry) => entry.kind === "capture")
  ).toHaveLength(2);
  expect(
    result.entries.filter((entry) => entry.kind === "funding")
  ).toHaveLength(1);
  expect(result.purchases).toHaveLength(1);
  expect(result.purchases[0]?.status).toBe("confirmed");
  expect(toolWalletPayments).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("prepaid-credits-wallet.png"),
    fullPage: true,
  });
});
