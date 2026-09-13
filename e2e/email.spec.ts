import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`email claim and exact draft approval at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/settings");
    await page
      .getByLabel("Choose your permanent address")
      .fill(`email-${width}-${Date.now()}`);
    await page
      .getByRole("button", { name: "Claim address", exact: true })
      .click();
    await expect(
      page.getByText("Demo address ready", { exact: true })
    ).toBeVisible();
    await page.getByRole("link", { name: /Email ·.*Open/u }).click();
    await expect(
      page.getByRole("button", { name: "Retry history" })
    ).toHaveCount(0);
    await expect(page.getByText("Reload history before sending.")).toHaveCount(
      0
    );
    await page.getByRole("button", { name: "New email", exact: true }).click();
    await page.getByLabel("To", { exact: true }).fill("recipient@example.com");
    await page
      .getByLabel("Subject", { exact: true })
      .fill("Please send a quote");
    await page
      .getByRole("region", { name: "Email reader" })
      .getByLabel("Message", { exact: true })
      .fill("Could you send me the quote as a PDF?");
    await page.getByRole("button", { name: "Save draft for review" }).click();
    await expect(
      page.getByRole("button", { name: "Approve and send" })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Approve and send" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("region", { name: "Email reader" })
      .getByLabel("Message", { exact: true })
      .fill("Please include installation in the quote.");
    await page.getByRole("button", { name: "Save draft for review" }).click();
    await expect(
      page
        .getByRole("paragraph")
        .filter({ hasText: "Please include installation in the quote." })
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve and send" }).click();
    await expect(
      page.getByText("Demo · Sent to provider", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve and send" })
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("email-approved.png") });
    expect(errors).toEqual([]);
  });
}
