import { expect, test } from "@playwright/test";

import { landingIdentity, changeLandingIdentity } from "./landing-identity";

const concepts = ["pond", "playground", "glasshouse"] as const;
for (const concept of concepts) {
  for (const width of [1440, 390, 320]) {
    test(`${concept} landing is public and responsive at ${width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      const privateRequests: string[] = [];
      const sockets: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/")) {
          privateRequests.push(request.url());
        }
      });
      page.on("websocket", (socket) => {
        if (new URL(socket.url()).pathname.startsWith("/ws/")) {
          sockets.push(socket.url());
        }
      });
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/landing/${concept}`);
      await expect(
        page.getByRole("heading", { name: "A home for your agents." })
      ).toBeVisible();
      await page
        .locator(".landing-hero-art img")
        .evaluate(async (image: HTMLImageElement) => {
          await image.decode();
        });
      await expect(
        page.getByRole("navigation", { name: "Primary" })
      ).toHaveCount(0);
      await expect(page.locator("video")).not.toHaveAttribute("src");
      await expect(
        page.getByText("Local identity · development preview").first()
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`${concept}-${width}.png`),
      });
      await page.locator("#setup").scrollIntoViewIfNeeded();
      await expect(page.locator(".landing-steps li")).toHaveCount(5);
      await page.locator(".landing-steps img").evaluateAll(async (images) => {
        await Promise.all(
          images.map(async (image) => {
            if (image instanceof HTMLImageElement) {
              await image.decode();
            }
          })
        );
      });
      await page.screenshot({
        path: testInfo.outputPath(`${concept}-setup-${width}.png`),
      });
      expect(privateRequests).toEqual([]);
      expect(sockets).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("the comparison page links all three worlds and local sign-in opens Home", async ({
  page,
}) => {
  await page.goto("/landing");
  await page.getByRole("link", { name: /The Playground/u }).click();
  await expect(page).toHaveURL(/\/landing\/playground$/u);
  await page.getByRole("button", { name: "Open workspace" }).first().click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole("heading", { name: "What can I help with?" })
  ).toBeVisible();
});

for (const concept of concepts) {
  test(`${concept} promo loads on intent, pauses offscreen and replays`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/landing/${concept}`);
    const video = page.locator("video");
    await expect(video).not.toHaveAttribute("src");
    await page.getByRole("button", { name: "Play promo", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause promo", exact: true })
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          await video.evaluate(
            (element: HTMLVideoElement) => element.currentTime
          )
      )
      .toBeGreaterThan(0);
    await page.locator("#setup").scrollIntoViewIfNeeded();
    await expect
      .poll(
        async () =>
          await video.evaluate((element: HTMLVideoElement) => element.paused)
      )
      .toBe(true);
    await video.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Play promo", exact: true }).click();
    await video.evaluate((element: HTMLVideoElement) => {
      element.currentTime = element.duration - 0.15;
    });
    await expect(
      page.getByRole("button", { name: "Replay promo", exact: true })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Replay promo", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause promo", exact: true })
    ).toBeVisible();
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    ).toBeLessThan(3);
  });
}

test("a cancelled sign-in stays on the landing, then a completed sign-in reaches onboarding", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await landingIdentity(page, "signed-out");
  await page.route("**/api/setup", async (route) => {
    await route.fulfill({ json: { v: 1, seenAt: null } });
  });
  await page.goto("/landing/pond");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }).first()
  ).toBeEnabled();
  await page.evaluate(() => {
    window.addEventListener("landing-test-login", () => {
      document.body.dataset["loginInvoked"] = "yes";
    });
  });
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-login-invoked",
    "yes"
  );
  await changeLandingIdentity(page, "signed-out");
  await expect(page).toHaveURL(/\/landing\/pond$/u);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  await changeLandingIdentity(page, "signed-in");
  await expect(page).toHaveURL(/\/welcome$/u);
  await expect(
    page.getByRole("heading", { name: "Welcome to Froggy." })
  ).toBeVisible();
});

test("an existing signed-in visitor can inspect a concept without a redirect", async ({
  page,
}) => {
  await landingIdentity(page, "signed-in");
  await page.goto("/landing/glasshouse");
  await expect(
    page.getByRole("button", { name: "Open workspace" }).first()
  ).toBeVisible();
  await expect(page).toHaveURL(/\/landing\/glasshouse$/u);
});

test("loading and failed sign-in leave the public page usable with a retry", async ({
  page,
}) => {
  await landingIdentity(page, "loading");
  await page.goto("/landing/playground");
  await expect(
    page.getByRole("button", { name: "Preparing sign-in" }).first()
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "A home for your agents." })
  ).toBeVisible();
  await changeLandingIdentity(page, "failed");
  await expect(
    page.getByRole("button", { name: "Retry sign-in" }).first()
  ).toBeEnabled();
  await changeLandingIdentity(page, "signed-out");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }).first()
  ).toBeEnabled();
});

test("a signed-out workspace URL still shows the original sign-in gate", async ({
  page,
}) => {
  await landingIdentity(page, "signed-out");
  await page.goto("/wallet");
  await expect(page.locator(".landing")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: /Sign in/u }).first()
  ).toBeVisible();
});
