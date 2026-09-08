import { expect, test } from "@playwright/test";

import { captureScreen } from "./capture";

test("appearance defaults to Passbook, persists, previews, and follows System", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "passbook");
  await page.getByRole("button", { name: "Lilypad", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "lilypad");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Lilypad", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveCSS("color-scheme", "dark");

  await page.goto("/wallet?theme=passbook");
  await expect(root).toHaveAttribute("data-theme", "passbook");
  await page.goto("/settings");
  await expect(root).toHaveAttribute("data-theme", "lilypad");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-theme", "passbook");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-theme", "lilypad");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "System", exact: true })
  ).toHaveAttribute("aria-pressed", "true");

  await page.goto("/settings?theme=passbook");
  await page.getByRole("button", { name: "Lilypad", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/u);
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "lilypad");
  await page.goto("/wallet?theme=unknown");
  await expect(root).toHaveAttribute("data-theme", "lilypad");
});

for (const theme of ["passbook", "lilypad"] as const) {
  for (const width of [1440, 768, 390, 320]) {
    test(`${theme} components fit at ${width}px with reduced motion`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/wallet?theme=${theme}`);
      const root = page.locator("html");
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(root).toHaveCSS(
        "background-color",
        theme === "passbook" ? "rgb(239, 241, 236)" : "rgb(13, 18, 15)"
      );
      const wallet = page.getByRole("region", { name: "Wallet", exact: true });
      await expect(wallet).toBeVisible();
      await expect(wallet).toHaveCSS(
        "border-radius",
        theme === "passbook" ? "20px" : "22px"
      );
      await expect(wallet.locator(".text-money").first()).toHaveCSS(
        "font-size",
        "32px"
      );
      await expect(wallet.locator(".text-machine").first()).toHaveCSS(
        "font-family",
        theme === "passbook" ? /IBM Plex Mono/u : /Inter Tight/u
      );
      await captureScreen(page, testInfo, `${theme}-wallet`);
      await page.getByText("Where it is", { exact: true }).click();
      await page
        .getByRole("button", { name: "Add funds", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS(
        "background-color",
        theme === "passbook" ? "rgb(252, 253, 251)" : "rgb(23, 31, 25)"
      );
      await captureScreen(page, testInfo, `${theme}-add-funds`);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      const overflowing = await page
        .locator("main > article")
        .evaluate((node) => node.scrollWidth > node.clientWidth + 1);
      expect(overflowing).toBe(false);
      await page.goto(`/settings?theme=${theme}`);
      const appearance = page.getByRole("group", {
        name: "Appearance",
        exact: true,
      });
      await expect(appearance).toBeVisible();
      await appearance.scrollIntoViewIfNeeded();
      await captureScreen(page, testInfo, `${theme}-settings`);
      expect(
        await page
          .locator("main > article")
          .evaluate((node) => node.scrollWidth > node.clientWidth + 1)
      ).toBe(false);
      await page.getByRole("button", { name: "Delete my data" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await captureScreen(page, testInfo, `${theme}-confirmation`);
      await page.getByRole("button", { name: "Keep it", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
