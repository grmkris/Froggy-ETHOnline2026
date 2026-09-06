import { expect, test } from "@playwright/test";

test("boots the workspace with the leash on screen and no browser errors", async ({
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
  // The leash is in the header before anything is spent. A leash you cannot
  // see is indistinguishable from no leash.
  await expect(
    page.getByLabel("Spending against the rolling cap")
  ).toContainText("of $10.00 today");

  expect(browserErrors).toEqual([]);
});

test("the details drawer lists every rule the agent is held to", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText(/per transaction/u)).toBeVisible();
  await expect(page.getByText(/ask above/u)).toBeVisible();
});

test("the paid endpoint answers 402 before it answers anything else", async ({
  request,
}) => {
  const response = await request.get("/oracle/snapshot?symbol=USDC");

  // This is the Hedera qualification in one assertion: the resource is really
  // gated, not gated-looking.
  expect(response.status()).toBe(402);
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
