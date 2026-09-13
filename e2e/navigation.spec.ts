import { expect, test } from "@playwright/test";

import { captureScreen } from "./capture";
import { lowerApprovalThreshold } from "./mandate";

/**
 * A second click while a workspace view-transition is still running aborts
 * it. The browser reports that as "Transition was skipped"; it is the
 * interruption working, not a page error.
 */
const skippedViewTransition = (text: string): boolean =>
  text.includes("Transition was skipped");

/**
 * Three destinations, one primary landmark, at every width.
 *
 * The rail replaces the pill above 768px rather than hiding it, so assistive
 * technology never sees two primary navigations. Below that the pill carries
 * the same three destinations and there is no "More" popover, because with
 * three destinations there is nothing left to hide.
 */
for (const theme of ["passbook", "lilypad"] as const) {
  for (const width of [1440, 768, 390, 320]) {
    const rail = width >= 768;
    test(`${theme} navigation reaches every destination at ${width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        if (!skippedViewTransition(error.message)) {
          errors.push(error.message);
        }
      });
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !skippedViewTransition(message.text())
        ) {
          errors.push(message.text());
        }
      });
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await page.goto(`/wallet?theme=${theme}`);

      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav).toHaveCount(1);
      // Three destinations, plus the two demoted places when the rail is up.
      await expect(nav.getByRole("link")).toHaveCount(3);
      await expect(nav.getByRole("button", { name: /^More/u })).toHaveCount(0);
      // One wordmark per screen: the rail owns it where the rail is up, and
      // the top bar carries it only when it is not.
      await expect(page.getByRole("banner")).toContainText("Your money");

      const targets = await nav.getByRole("link").evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.height >= 44 && box.left >= 0 && box.right <= window.innerWidth
          );
        })
      );
      expect(targets.every(Boolean)).toBe(true);
      await captureScreen(page, testInfo, `${theme}-navigation`);

      // Unrolled on purpose: this walks one browser through three
      // destinations in order, so the steps cannot run in parallel.
      await nav.getByRole("link", { name: "Home", exact: true }).click();
      await expect(page).toHaveURL(/\/$/u);
      await nav.getByRole("link", { name: "Watchlist", exact: true }).click();
      await expect(page).toHaveURL(/\/watchlist$/u);
      await page.getByRole("button", { name: "Workspace menu" }).click();
      await page
        .locator('[data-slot="popover-content"]')
        .getByRole("link", { name: "Your money", exact: true })
        .click();
      await expect(page).toHaveURL(/\/wallet$/u);

      if (rail) {
        // Secondary places are reachable and visibly not destinations.
        await page.getByRole("button", { name: "Workspace menu" }).click();
        await page
          .locator('[data-slot="popover-content"]')
          .getByRole("link", { name: "Connections" })
          .click();
        await expect(page).toHaveURL(/\/agents$/u);
        await page.getByRole("button", { name: "Workspace menu" }).click();
        await page
          .locator('[data-slot="popover-content"]')
          .getByRole("link", { name: "Account" })
          .click();
        await expect(page).toHaveURL(/\/settings$/u);
      } else {
        // The composer must clear the pill rather than sit under it.
        await page.goto("/chat");
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
      }
      expect(errors).toEqual([]);
    });
  }
}

test("Home counts a waiting approval, and stops when it is answered", async ({
  page,
}) => {
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/chat");
  await leash.applied;
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Buy the lending snapshot");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });

  const nav = page.getByRole("navigation", { name: "Primary" });
  const waiting = nav.getByRole("link", { name: /^Home, 1 approval waiting/u });
  await expect(waiting).toBeVisible();

  // The count survives leaving the conversation and coming back.
  await page.getByRole("button", { name: "Workspace menu" }).click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("link", { name: "Your money", exact: true })
    .click();
  await expect(waiting).toBeVisible();
  // While something waits, Home is named for it — so this is the link to click.
  await waiting.click();
  // Home offers a route to the decision, never a second set of answer buttons.
  await ticket.getByRole("button", { name: "Not this time" }).click();
  await expect(
    nav.getByRole("link", { name: "Home", exact: true })
  ).toBeVisible();
});
