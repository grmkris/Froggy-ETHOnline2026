import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  decodeAppServerMessage,
  encodeAppServerMessage,
} from "../packages/protocol/src/app";
import { lowerApprovalThreshold } from "./mandate";

interface WalletUpdate {
  send?: (units: string) => void;
}

interface MotionSample {
  readonly slot: string;
  readonly name: string;
  readonly duration: number;
  readonly delay: number;
  readonly frames: readonly {
    readonly transform: string;
    readonly opacity: string;
  }[];
}

declare global {
  interface Window {
    motionSamples: MotionSample[];
    finishMotionBrowse?: () => void;
    motionIndicatorFrames: { path: string; x: number }[];
  }
}

/** Observe real browser animations, including snapshots and Motion's WAAPI output. */
const observeMotion = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.motionSamples = [];
    window.motionIndicatorFrames = [];
    const seen = new WeakSet<Animation>();
    /**
     * Record an animation the moment it exists.
     *
     * Polling alone loses animations the app finishes early: a focusin while
     * the last input was the keyboard calls `finish()` on anything containing
     * the focused element, so a ticket that springs in after typing can be
     * over before the next frame callback runs. Reading the keyframes at
     * creation is what the assertions want anyway, since they check the
     * specification rather than a sampled value.
     */
    const record = (animation: Animation): void => {
      const { effect } = animation;
      if (
        seen.has(animation) ||
        !(effect instanceof KeyframeEffect) ||
        !(effect.target instanceof HTMLElement)
      ) {
        return;
      }
      seen.add(animation);
      const timing = effect.getTiming();
      if (window.motionSamples.length < 300) {
        window.motionSamples.push({
          slot:
            effect.target.dataset["slot"] ??
            effect.target.closest<HTMLElement>("[data-slot=wallet-total]")
              ?.dataset["slot"] ??
            "",
          name:
            animation instanceof CSSAnimation
              ? animation.animationName
              : (effect.pseudoElement ?? ""),
          duration: Number(timing.duration),
          delay: timing.delay ?? 0,
          frames: effect.getKeyframes().map((frame) => ({
            transform: String(frame["transform"] ?? "none"),
            opacity: String(frame["opacity"] ?? ""),
          })),
        });
      }
    };
    // Patching the prototype is the only hook that sees an animation before
    // the app can finish it. Referencing the method unbound is exactly what a
    // wrapper needs, and `this` is forwarded on every call.
    // oxlint-disable-next-line typescript/unbound-method
    const started = Element.prototype.animate;
    Element.prototype.animate = function animate(
      this: Element,
      ...args: Parameters<Element["animate"]>
    ): Animation {
      const animation = started.call(this, ...args);
      record(animation);
      return animation;
    };
    const sample = (): void => {
      const indicator = document.querySelector(
        '[data-slot="navigation-indicator"]'
      );
      if (indicator !== null && window.motionIndicatorFrames.length < 600) {
        window.motionIndicatorFrames.push({
          path: location.pathname,
          x: indicator.getBoundingClientRect().x,
        });
      }
      // CSS animations are not created through `Element.animate`, so the
      // poll still catches those.
      for (const animation of document.getAnimations()) {
        record(animation);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
};

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`appearance keeps its hit targets still with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await observeMotion(page);
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    // Measure the theme change after the asynchronous settings layout has settled.
    await page.getByText("Technical details", { exact: true }).click();
    await expect(
      page.getByText("the agent has no signer", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Nothing scheduled.", { exact: true })
    ).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const appearance = page.getByRole("group", {
      name: "Appearance",
      exact: true,
    });
    await appearance.scrollIntoViewIfNeeded();
    const choices = appearance.getByRole("button");
    const before = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      })
    );
    await appearance.getByRole("button", { name: "Lilypad" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "lilypad");
    const after = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      })
    );
    expect(after).toEqual(before);
    await expect
      .poll(
        async () =>
          await page.evaluate(
            (duration) =>
              window.motionSamples.some(
                (sample) =>
                  sample.name === "surface-in" && sample.duration === duration
              ),
            reducedMotion === "reduce" ? 125 : 250
          )
      )
      .toBe(true);
    await appearance.getByRole("button", { name: "Passbook" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "passbook"
    );
    await appearance.getByRole("button", { name: "Lilypad" }).focus();
    await page.keyboard.press("Space");
    await expect(appearance.getByRole("button", { name: "Lilypad" })).toHaveCSS(
      "outline-style",
      "solid"
    );
    await expect(appearance.getByRole("button", { name: "Lilypad" })).toHaveCSS(
      "outline-width",
      "2px"
    );
    await expect(
      appearance.getByRole("button", { name: "Lilypad" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-slot="appearance-indicator"]')).toHaveCSS(
      "transform",
      /matrix\(1, 0, 0, 1,/u
    );
  });
}

test("reduced-motion dialogs stay centred and return keyboard focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/wallet");
  const add = page.getByRole("button", { name: "Add funds", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add funds" });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => getComputedStyle(node).transitionDuration)
  ).toBe("0s");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`daily navigation stays still with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await observeMotion(page);
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const watchlist = nav.getByRole("link", { name: "Watchlist", exact: true });
    await watchlist.click();
    await expect(
      page.getByRole("heading", { name: "Watchlist", exact: true })
    ).toBeVisible();
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await watchlist.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/watchlist$/u);
    expect(
      await page.evaluate(() =>
        window.motionSamples.filter(
          (sample) =>
            sample.name.startsWith("page-") || sample.slot === "navigation-pill"
        )
      )
    ).toEqual([]);
  });
}

test("primary presses in place and Add funds springs from 0.98", async ({
  page,
}) => {
  await observeMotion(page);
  await page.goto("/wallet");
  const add = page.getByRole("button", { name: "Add funds", exact: true });
  await add.hover();
  await expect(add).toHaveCSS("transform", "none");
  await page.mouse.down();
  await expect(add).toHaveCSS("transform", "matrix(0.97, 0, 0, 0.97, 0, 0)");
  await page.mouse.up();
  const dialog = page.getByRole("dialog", { name: "Add funds" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          window.motionSamples.some(
            (sample) =>
              sample.slot === "dialog-content" &&
              sample.frames.some((frame) => frame.transform.includes("0.98"))
          )
        )
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
});

test("wallet values update immediately while the funding target stays still", async ({
  page,
}) => {
  await observeMotion(page);
  const update: WalletUpdate = {};
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag !== "Success" ||
        decoded.success.type !== "wallet.state"
      ) {
        socket.send(message);
        return;
      }
      const event = decoded.success;
      update.send = (units) => {
        socket.send(
          encodeAppServerMessage({
            ...event,
            wallet: {
              ...event.wallet,
              pocketUsdMicros: 0,
              totalUsdMicros: null,
              balances: { ...event.wallet.balances, usdcUnits: units },
            },
          })
        );
      };
      update.send("12000000");
    });
  });
  await page.goto("/wallet");
  const total = page.locator('[data-slot="wallet-total"]');
  await expect(total).toContainText("$12.00");
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          window.motionSamples.some(
            (sample) =>
              sample.slot === "wallet-total" && sample.duration === 600
          )
        )
    )
    .toBe(false);
  const add = page.getByRole("button", { name: "Add funds", exact: true });
  await add.hover();
  await expect(add).toHaveCSS("transform", "none");
  const before = await add.boundingBox();
  await page.evaluate(() => {
    window.motionSamples = [];
  });
  update.send?.("24000000");
  await expect(total).toContainText("$24.00");
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          window.motionSamples.some(
            (sample) =>
              sample.slot === "wallet-total" && sample.duration === 600
          )
        )
    )
    .toBe(false);
  expect(await add.boundingBox()).toEqual(before);
});

test("stream arrivals rise and approvals spring even after typing", async ({
  page,
}) => {
  await observeMotion(page);
  const leash = await lowerApprovalThreshold(page, 0.001);
  await page.goto("/chat");
  await leash.applied;
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Buy the lending snapshot");
  await page.keyboard.press("Enter");
  const ticket = page.getByLabel(/^Approve .* to /u);
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          window.motionSamples.some(
            (sample) =>
              sample.slot === "motion-item" &&
              sample.duration === 240 &&
              sample.frames.some((frame) => frame.transform.includes("12px"))
          )
        )
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          window.motionSamples.some(
            (sample) =>
              sample.slot === "motion-item" &&
              sample.duration === 300 &&
              sample.frames.some((frame) => frame.transform.includes("0.97"))
          )
        )
    )
    .toBe(true);
  await ticket.getByRole("button", { name: "Not this time" }).click();
  await expect(ticket).toHaveCount(0);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`live browse shimmer and incoming words respect ${reducedMotion} motion`, async ({
    page,
  }) => {
    await observeMotion(page);
    await page.emulateMedia({ reducedMotion });
    // A timed UI-message stream exercises the real renderer without a live browser or model.
    await page.addInitScript(() => {
      const finished = Promise.withResolvers<null>();
      window.finishMotionBrowse = () => {
        finished.resolve(null);
      };
      const originalFetch = window.fetch;
      Object.defineProperty(window, "fetch", {
        configurable: true,
        value: async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (new URL(url, location.href).pathname !== "/api/chat") {
            return await originalFetch(input, init);
          }
          const chunks = [
            { type: "start", messageId: "motion-fixture" },
            { type: "start-step" },
            {
              type: "tool-input-available",
              toolCallId: "motion-browse",
              toolName: "browser_navigate",
              input: { url: "https://example.com" },
            },
            { type: "text-start", id: "motion-words" },
            {
              type: "text-delta",
              id: "motion-words",
              delta: "Motion fixture: ",
            },
            { type: "text-delta", id: "motion-words", delta: "words arrive " },
            {
              type: "text-delta",
              id: "motion-words",
              delta: "while the page works.",
            },
            {
              type: "tool-output-available",
              toolCallId: "motion-browse",
              output: "Opened example.com (fixture).",
            },
            { type: "text-end", id: "motion-words" },
            { type: "finish-step" },
            { type: "finish" },
          ];
          const encoder = new TextEncoder();
          let index = 0;
          return new Response(
            new ReadableStream({
              async pull(controller) {
                const delay = Promise.withResolvers<null>();
                setTimeout(() => {
                  delay.resolve(null);
                }, 100);
                await delay.promise;
                const chunk = chunks[index];
                if (chunk?.type === "tool-output-available") {
                  await finished.promise;
                }
                index += 1;
                controller.enqueue(
                  encoder.encode(
                    `data: ${chunk === undefined ? "[DONE]" : JSON.stringify(chunk)}\n\n`
                  )
                );
                if (chunk === undefined) {
                  controller.close();
                }
              },
            }),
            {
              headers: {
                "content-type": "text/event-stream",
                "x-vercel-ai-ui-message-stream": "v1",
              },
            }
          );
        },
      });
    });
    await page.goto("/chat");
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("Show the motion fixture");
    await page.keyboard.press("Enter");
    const browse = page.locator('[data-tool="browse"]');
    await expect(browse).toHaveAttribute("data-live", "true");
    await expect
      .poll(
        async () =>
          await browse.evaluate(
            (node) => getComputedStyle(node, "::before").animationName
          )
      )
      .toBe(reducedMotion === "reduce" ? "none" : "browse-shimmer");
    await page.evaluate(() => {
      window.finishMotionBrowse?.();
    });
    await expect(browse).toHaveAttribute("data-live", "false");
    await expect(page.getByRole("log")).toContainText(
      "words arrive while the page works."
    );
    const words = await page.evaluate(() =>
      window.motionSamples.filter((sample) => sample.name === "sd-fadeIn")
    );
    expect(words.length > 0).toBe(reducedMotion === "no-preference");
    expect(
      await browse.evaluate(
        (node) => getComputedStyle(node, "::before").animationName
      )
    ).toBe("none");
  });
}
