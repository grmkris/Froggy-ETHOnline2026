/**
 * The welcome: three steps after sign-up, and two endings.
 *
 * A local identity is not a sign-up, so Home never sends it to the welcome
 * on its own; these tests reach the flow the way anyone can, from the link
 * at the foot of Home or by URL, and check that every exit lands on Home
 * and writes the one fact the flow exists to write.
 */

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { Schema } from "effect";

import { SetupState } from "../packages/protocol/src/setup";

const decodeState = Schema.decodeUnknownSync(SetupState);

const seenAt = async (
  page: Page,
  request: APIRequestContext
): Promise<number | null> => {
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const response = await request.get("/api/setup", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  return decodeState(await response.json()).seenAt;
};

test("Home keeps a local identity, and offers the welcome from its foot", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nothing needs you." })
  ).toBeVisible();
  await expect(page.locator('[data-pose="idle"]').first()).toBeVisible();
  await page.getByRole("link", { name: "Show the welcome again" }).click();
  await expect(page).toHaveURL(/\/welcome$/u);
  await expect(
    page.getByRole("heading", { name: "Welcome to Froggy." })
  ).toBeVisible();
  // The workspace's chrome stays out of the welcome.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0
  );
  expect(errors).toEqual([]);
});

test("the welcome runs through its three steps and lands on Home", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await page.goto("/welcome");
  expect(await seenAt(page, request)).toBeNull();

  const steps = page.getByRole("list", { name: "Setup steps" });
  await expect(steps.getByText("Welcome")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Use Froggy here" })
  ).toBeChecked();
  await expect(page.getByText("You are talking to an AI agent.")).toBeVisible();
  await expect(
    page.getByText("a Browser Use Chrome profile that stays with you")
  ).toBeVisible();
  await expect(page.getByText("wiped when you leave")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("welcome-1.png") });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "How much may Froggy spend?" })
  ).toBeVisible();
  await Promise.all(
    ["$1.00", "$2.00", "$10.00", "30 days"].map(async (value) => {
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    })
  );
  // A local identity has nothing for Privy to hold, so there is no grant to ask for.
  await expect(
    page.getByRole("button", { name: "Let Froggy pay under these rules" })
  ).toHaveCount(0);
  await expect(
    page.getByText("Froggy can look but not pay here.")
  ).toBeVisible();
  await expect(
    page.getByText("Froggy’s engine and Privy both enforce these numbers.")
  ).toBeVisible();
  await expect(
    page.getByText(/\bleash\b|\bpocket\b|\ballowance\b|\btop-up\b/iu)
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("welcome-2.png") });
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Froggy." })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "When Froggy needs you." })
  ).toBeVisible();
  await expect(
    page.getByText("Telegram is not configured on this deployment.")
  ).toBeVisible();
  await page.getByLabel("Daily digest hour").selectOption("8");
  await expect(page.getByLabel("Daily digest hour")).toHaveValue("8");
  await page.screenshot({ path: testInfo.outputPath("welcome-3.png") });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "You’re set." })
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
    "placeholder",
    "What should I look into?"
  );
  await expect(page.getByText("Every day at 8 AM")).toBeVisible();
  await expect(
    page.getByText("Not granted. Froggy cannot pay yet.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add funds" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("welcome-4.png") });
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole("heading", { name: "Nothing needs you." })
  ).toBeVisible();
  await expect.poll(async () => await seenAt(page, request)).not.toBeNull();
  expect(errors).toEqual([]);
});

for (const viewport of [
  { height: 844, width: 390 },
  { height: 568, width: 320 },
]) {
  test(`the welcome fits a ${viewport.width}px screen`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/welcome");
    const fits = async (): Promise<boolean> =>
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );
    await expect(
      page.getByRole("heading", { name: "Welcome to Froggy." })
    ).toBeVisible();
    expect(await fits()).toBe(true);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("30 days", { exact: true })).toBeVisible();
    expect(await fits()).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`welcome-${viewport.width}.png`),
    });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "You’re set." })
    ).toBeVisible();
    expect(await fits()).toBe(true);
  });
}

test("Skip setup is a way out too, and counts as welcomed", async ({
  page,
  request,
}) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole("heading", { name: "Nothing needs you." })
  ).toBeVisible();
  await expect.poll(async () => await seenAt(page, request)).not.toBeNull();
});

test("the assistant door ends on the sentence to paste", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.goto("/welcome");
  // The card is the label; pressing anywhere on it picks the door.
  await page.getByText("Connect your own assistant", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Connect your own assistant" })
  ).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your assistant." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy for your agent" })
  ).toBeVisible();
  await expect(
    page.getByText(`claude mcp add --transport http froggy ${baseURL}/mcp`)
  ).toBeVisible();
  await expect(page.getByText("No agent connected yet.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("welcome-4b.png") });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/$/u);
});

test("a starter on the last screen opens the conversation", async ({
  page,
  request,
}) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re set." })
  ).toBeVisible();
  await page.getByRole("button", { name: "What can you do for me?" }).click();
  await expect(page).toHaveURL(/\/chat/u);
  await expect(page.getByRole("log")).toContainText("What can you do for me?");
  await expect.poll(async () => await seenAt(page, request)).not.toBeNull();
});
