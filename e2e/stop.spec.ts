import { expect, test } from "@playwright/test";

import { lowerApprovalThreshold } from "./mandate";

for (const failure of ["http", "network"] as const) {
  test(`an unconfirmed stop can be retried after ${failure} failure`, async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/chat/stop", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await (failure === "network"
          ? route.abort("failed")
          : route.fulfill({ status: 500, json: { error: "unavailable" } }));
      } else {
        await route.continue();
      }
    });
    const leash = await lowerApprovalThreshold(page, 0.001);
    await page.goto("/chat");
    await leash.applied;
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Send 0.004 USDC to 0x0000000000000000000000000000000000000001");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel(/^Approve .* to /u)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Stop the run" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Stopping is unconfirmed" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry stopping" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Stop requested" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry stopping" })
    ).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}
