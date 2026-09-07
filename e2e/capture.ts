import type { Page, TestInfo } from "@playwright/test";

/** Capture the viewport without exposing one-time connection credentials. */
export const captureScreen = async (
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    mask: [
      page.getByRole("textbox", {
        name: /^(?:Authorization code|Connection token)$/u,
      }),
    ],
    path: testInfo.outputPath(`${name}-${page.viewportSize()?.width}.png`),
  });
};

/** The app scrolls inside its frame; fullPage alone silently misses the rest. */
export const capturePage = async (
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> => {
  const scroller = page.locator(
    'main > article, [data-slot="chat-welcome-scroll"]'
  );
  if ((await scroller.count()) === 0) {
    await captureScreen(page, testInfo, name);
    return;
  }
  const original = await scroller.evaluate((node) => node.scrollTop);
  await scroller.evaluate((node) => {
    node.scrollTop = 0;
  });
  await captureScreen(page, testInfo, name);
  // A short overlap keeps context between successive screenshots.
  const captureNext = async (part: number): Promise<void> => {
    if (part > 12) {
      return;
    }
    const moved = await scroller.evaluate((node) => {
      const before = node.scrollTop;
      node.scrollTop += Math.max(1, node.clientHeight - 80);
      return node.scrollTop > before;
    });
    if (!moved) {
      return;
    }
    await captureScreen(page, testInfo, `${name}-part-${part}`);
    await captureNext(part + 1);
  };
  await captureNext(2);
  await scroller.evaluate((node, top) => {
    node.scrollTop = top;
  }, original);
};

/** Resizing and scrolling one page must stay sequential. */
export const captureResponsive = async (
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> => {
  const original = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await capturePage(page, testInfo, name);
  await page.setViewportSize({ width: 390, height: 844 });
  await capturePage(page, testInfo, name);
  if (original !== null) {
    await page.setViewportSize(original);
  }
};
