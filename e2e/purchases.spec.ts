import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import { Receipt } from "../packages/domain/src/receipt";
import { decodeBrowserServerMessage } from "../packages/protocol/src/browser";
import type { BrowserState } from "../packages/protocol/src/browser";
import {
  PurchaseList,
  PurchaseTicket,
} from "../packages/protocol/src/purchases";

const decodeList = Schema.decodeUnknownSync(PurchaseList);
const decodeTicket = Schema.decodeUnknownSync(PurchaseTicket);

const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
};

const requestDemo = async (
  page: Page,
  purpose: string
): Promise<{
  purchase: PurchaseTicket;
  headers: { authorization: string };
}> => {
  await page.goto("/services");
  await page.getByRole("button", { name: "Use demo report" }).click();
  const form = page.getByRole("form", { name: "Request a URL purchase" });
  await form.getByLabel("Purpose", { exact: true }).fill(purpose);
  const requested = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/purchases" &&
      response.request().method() === "POST"
  );
  await form
    .getByRole("button", { name: "Request purchase", exact: true })
    .click();
  const response = await requested;
  expect(response.ok()).toBe(true);
  return {
    purchase: decodeTicket(await response.json()),
    headers: {
      authorization: response.request().headers()["authorization"] ?? "",
    },
  };
};

const approvalFor = (page: Page, purpose: string) =>
  page
    .getByLabel("Approve URL purchase", { exact: true })
    .filter({ hasText: purpose });

test.describe("URL purchases", () => {
  test.describe.configure({ mode: "serial" });

  test("approves a saved request after reload and keeps the delivered response", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    const purpose = `Saved report ${crypto.randomUUID()}`;
    const { purchase, headers } = await requestDemo(page, purpose);
    expect(purchase.payment.state).toBe("none");
    const ticket = approvalFor(page, purpose);
    await expect(ticket).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Purchase approvals" })
    ).toContainText("/demo/x402/report");
    await expect(
      page.getByRole("region", { name: "Purchase approvals" })
    ).toContainText("Hedera testnet");
    await page.screenshot({
      path: testInfo.outputPath("purchase-approval-desktop.png"),
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(ticket).toBeVisible();
    const amountLines = await ticket
      .getByText(/^\$[\d.]+$/u)
      .evaluate((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      });
    expect(amountLines).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("purchase-approval-mobile.png"),
    });

    await page.reload();
    await expect(approvalFor(page, purpose)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Wallet", exact: true })
      .click();
    await expect(approvalFor(page, purpose)).toBeVisible();
    await approvalFor(page, purpose)
      .getByRole("button", { name: "Pay once", exact: true })
      .click();
    await expect(approvalFor(page, purpose)).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Services", exact: true })
      .click();
    const result = page
      .getByRole("region", { name: "URL purchases" })
      .locator('[data-slot="card"]')
      .filter({ hasText: purpose });
    await expect(result).toContainText("Simulated payment · result delivered", {
      timeout: 20_000,
    });
    await expect(result).toContainText("Your USDC lending report");
    await expect(result).toContainText("Simulated");
    expect(await result.locator("iframe, script, style").count()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("purchase-result-mobile.png"),
    });

    await page.reload();
    await expect(result).toContainText("Simulated payment · result delivered");
    const response = await request.get(`/api/purchases/${purchase.id}`, {
      headers,
    });
    const stored = decodeTicket(await response.json());
    expect(stored.id).toBe(purchase.id);
    expect(stored.payment.state).toBe("settled");
    expect(stored.delivery.state).toBe("delivered");
    expect(stored.receiptId).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test("declines a request without submitting a payment", async ({
    page,
    request,
  }) => {
    const errors = watchErrors(page);
    const purpose = `Declined report ${crypto.randomUUID()}`;
    const { purchase, headers } = await requestDemo(page, purpose);
    await approvalFor(page, purpose)
      .getByRole("button", { name: "Deny", exact: true })
      .click();
    await expect(approvalFor(page, purpose)).toHaveCount(0);
    const result = page
      .getByRole("region", { name: "URL purchases" })
      .locator('[data-slot="card"]')
      .filter({ hasText: purpose });
    await expect(result).toContainText("Declined");
    const response = await request.get(`/api/purchases/${purchase.id}`, {
      headers,
    });
    const stored = decodeTicket(await response.json());
    expect(stored.status).toBe("declined");
    expect(stored.payment.state).toBe("none");
    expect(stored.payment.sentAt).toBeNull();
    expect(stored.receiptId).not.toBeNull();
    const receiptsResponse = await request.get("/api/receipts", { headers });
    expect(receiptsResponse.ok()).toBe(true);
    const { receipts } = Schema.decodeUnknownSync(
      Schema.Struct({ receipts: Schema.Array(Receipt) })
    )(await receiptsResponse.json());
    const refusal = receipts.find((receipt) => receipt.id === stored.receiptId);
    expect(refusal?.decision._tag).toBe("deny");
    expect(refusal?.settlement).toBeUndefined();
    expect(refusal?.intent.purpose).toBe(purpose);
    expect(errors).toEqual([]);
  });

  test("a paid page in the shared Chrome asks and opens its original HTML", async ({
    page,
    request,
    baseURL,
  }, testInfo) => {
    test.setTimeout(60_000);
    const errors = watchErrors(page);
    let state: BrowserState | null = null;
    page.on("websocket", (socket) => {
      if (!new URL(socket.url()).pathname.endsWith("/ws/browser")) {
        return;
      }
      socket.on("framereceived", ({ payload }) => {
        const decoded = decodeBrowserServerMessage(payload);
        if (
          decoded._tag === "Success" &&
          decoded.success.type === "browser.state"
        ) {
          ({ state } = decoded.success);
        }
      });
    });
    const listing = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/purchases"
    );
    await page.goto("/");
    const sessionResponse = await listing;
    const headers = {
      authorization: sessionResponse.request().headers()["authorization"] ?? "",
    };
    await page.getByRole("button", { name: "Show the browser" }).click();
    const target = new URL("/demo/x402/report", baseURL).href;
    await page
      .getByRole("textbox", { name: "Address", exact: true })
      .fill(target);
    await page
      .getByRole("textbox", { name: "Address", exact: true })
      .press("Enter");
    const purpose = `Open paid page at ${new URL(target).host}`;
    const ticket = approvalFor(page, purpose);
    await expect(ticket).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("region", { name: "Purchase approvals" })
    ).toContainText("Simulated");
    await page.screenshot({
      path: testInfo.outputPath("browser-payment-approval.png"),
    });
    await ticket.getByRole("button", { name: "Pay once", exact: true }).click();
    await expect(ticket).toHaveCount(0);
    await expect
      .poll(
        () => state?.tabs.find((tab) => tab.id === state?.activeTabId)?.title,
        { timeout: 20_000 }
      )
      .toBe("Your USDC lending report · Pond Observatory");
    await expect(
      page.getByRole("textbox", { name: "Address", exact: true })
    ).toHaveAttribute("placeholder", target);
    await page.screenshot({
      path: testInfo.outputPath("browser-native-report.png"),
    });
    const response = await request.get("/api/purchases", { headers });
    const list = decodeList(await response.json());
    const purchase = list.purchases.find(
      (item) => item.source === "browser" && item.request.url === target
    );
    expect(purchase?.payment.state).toBe("settled");
    expect(purchase?.delivery.state).toBe("delivered");
    expect(purchase?.delivery.contentType).toContain("text/html");
    expect(purchase?.delivery.body).toContain(
      "<title>Your USDC lending report"
    );
    expect(errors).toEqual([]);
  });

  test("a chat URL request pauses for approval and resumes with its result and receipt", async ({
    page,
    request,
    baseURL,
  }, testInfo) => {
    const errors = watchErrors(page);
    const listing = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/purchases"
    );
    await page.goto("/");
    const sessionResponse = await listing;
    const headers = {
      authorization: sessionResponse.request().headers()["authorization"] ?? "",
    };
    const target = new URL("/demo/x402/report", baseURL).href;
    await page
      .getByRole("textbox", { name: "Message" })
      .fill(`Buy ${target} for at most five cents`);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    const ticket = approvalFor(page, "Read the USDC lending report");
    await expect(ticket).toBeVisible({ timeout: 20_000 });
    const log = page.getByRole("log");
    await expect(log).toHaveAttribute("aria-busy", "true");
    await expect(
      log.getByRole("button", { name: /Requested a paid resource at/u })
    ).toContainText("waiting for you");
    await page.screenshot({
      path: testInfo.outputPath("chat-url-approval.png"),
    });
    await ticket.getByRole("button", { name: "Pay once", exact: true }).click();
    await expect(ticket).toHaveCount(0);
    await expect(log).toHaveAttribute("aria-busy", "false", {
      timeout: 20_000,
    });
    await expect(
      log.getByText("The scripted URL request has finished.", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(/^Receipt: Paid/u).first()).toBeVisible();

    const response = await request.get("/api/purchases", { headers });
    const list = decodeList(await response.json());
    const purchase = list.purchases.find(
      (item) => item.source === "chat" && item.request.url === target
    );
    expect(purchase?.maxUsdMicros).toBe(50_000);
    expect(purchase?.payment.state).toBe("settled");
    expect(purchase?.delivery.state).toBe("delivered");
    expect(purchase?.receiptId).not.toBeNull();
    if (purchase === undefined) {
      throw new Error("Chat purchase was not recorded");
    }
    const tool = log.getByRole("button", {
      name: /Requested a paid resource at/u,
    });
    await expect(tool).toContainText("done");
    await expect(
      log.getByRole("button", { name: "Show the unlocked page" })
    ).toHaveCount(0);
    await expect(
      log.getByRole("link", { name: "View saved result" })
    ).toHaveAttribute("href", "/services");
    await tool.click();
    await expect(log).toContainText(purchase.id);
    await page.screenshot({ path: testInfo.outputPath("chat-url-result.png") });
    expect(errors).toEqual([]);
  });
});
