import { expect, test } from "@playwright/test";

test("boots the workspace with all three panes and no browser errors", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });

  await page.goto("/");

  await expect(page.getByText("Froggy", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Address" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wallet" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("shows the mandate the agent is held to, and a way to freeze it", async ({
  page,
}) => {
  await page.goto("/");

  // The caps are on screen before anything is spent. A leash you cannot see is
  // indistinguishable from no leash.
  await expect(page.getByText(/per transaction/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Freeze" })).toBeVisible();
});

test("the paid endpoint answers 402 before it answers anything else", async ({
  request,
}) => {
  const response = await request.get("/oracle/snapshot?symbol=USDC");

  // This is the Hedera qualification in one assertion: the resource is really
  // gated, not gated-looking.
  expect(response.status()).toBe(402);
  // SAFETY: the assertions below are the test. A 402 body that does not carry
  // these fields fails them, which is exactly the outcome this spec exists for.
  const parsed: unknown = await response.json();
  // SAFETY: the assertions below are the test. A 402 body that does not carry
  // these fields fails them, which is exactly what this spec exists to catch.
  const body = parsed as {
    accepts: { network: string; payTo: string; scheme: string }[];
    x402Version: number;
  };
  expect(body.x402Version).toBe(2);
  expect(body.accepts[0]?.network).toBe("hedera:testnet");
  expect(body.accepts[0]?.scheme).toBe("exact");
});
