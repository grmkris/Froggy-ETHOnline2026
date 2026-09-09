import { expect, test } from "@playwright/test";

import { captureScreen } from "./capture";
import { lowerApprovalThreshold } from "./mandate";

for (const theme of ["passbook", "lilypad"] as const) {
  for (const width of [1440, 768, 390, 320]) {
    test(`${theme} pill reaches every page at ${width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await page.goto(`/wallet?theme=${theme}`);
      const nav = page.getByRole("navigation", { name: "Primary" });
      const more = nav.getByRole("button", { name: /^More/u });
      await expect(nav).toHaveCount(1);
      await expect(nav.getByRole("link")).toHaveCount(3);
      await expect(
        nav.getByRole("link", { name: "Wallet", exact: true })
      ).toHaveAttribute("aria-current", "page");
      const targets = await nav.locator("a, button").evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.width >= 44 &&
            box.height >= 44 &&
            box.left >= 0 &&
            box.right <= window.innerWidth
          );
        })
      );
      expect(targets).toEqual([true, true, true, true]);
      await captureScreen(page, testInfo, `${theme}-pill`);

      await more.focus();
      await page.keyboard.press("Enter");
      const popup = nav.getByRole("dialog", { name: "More places" });
      await expect(popup).toBeVisible();
      await expect(
        nav.getByRole("link", { name: "Agents", exact: true })
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        nav.getByRole("link", { name: "Activity", exact: true })
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        nav.getByRole("link", { name: "Settings", exact: true })
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/settings$/u);
      await expect(popup).toHaveCount(0);
      await expect(more).toHaveAttribute("aria-current", "page");
      await expect(more).toBeFocused();

      await more.click();
      await expect(
        nav.getByRole("link", { name: "Settings", exact: true })
      ).toHaveAttribute("aria-current", "page");
      await captureScreen(page, testInfo, `${theme}-more`);
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(more).toBeFocused();
      await more.click();
      await nav.getByRole("link", { name: "Agents", exact: true }).click();
      await expect(page).toHaveURL(/\/agents$/u);
      await expect(popup).toHaveCount(0);
      await more.click();
      await page.getByRole("heading", { name: "Agents", exact: true }).click();
      await expect(popup).toHaveCount(0);

      await nav.getByRole("link", { name: "Services", exact: true }).click();
      await expect(page).toHaveURL(/\/services$/u);
      await nav.getByRole("link", { name: "Chat", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Message" })
      ).toBeVisible();
      const composer = await page
        .getByRole("textbox", { name: "Message" })
        .boundingBox();
      const pill = await page
        .locator('[data-slot="navigation-pill"]')
        .boundingBox();
      expect(composer).not.toBeNull();
      expect(pill).not.toBeNull();
      expect((composer?.y ?? 0) + (composer?.height ?? 0)).toBeLessThan(
        pill?.y ?? 0
      );
      expect(errors).toEqual([]);
    });
  }
}

test("the home badge follows a waiting approval across page changes", async ({
  page,
}) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/");
  await leash.applied;
  await page.getByText("Buy the lending snapshot").click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(
    nav.getByRole("link", { name: "Chat, 1 approval waiting" })
  ).toBeVisible();
  await nav.getByRole("link", { name: "Wallet", exact: true }).click();
  await nav.getByRole("link", { name: "Chat, 1 approval waiting" }).click();
  await ticket.getByRole("button", { name: "Not this time" }).click();
  await expect(
    nav.getByRole("link", { name: "Chat", exact: true })
  ).toBeVisible();
});
