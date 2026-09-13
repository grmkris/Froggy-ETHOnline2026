import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Schema } from "effect";

import type { EmailMessage } from "../packages/domain/src/email";
import { EmailId, EmailFileId, SessionId } from "../packages/domain/src/id";
import {
  decodeAppServerMessage,
  encodeAppServerMessage,
} from "../packages/protocol/src/app";
import { EmailStatus } from "../packages/protocol/src/email";
import { captureScreen } from "./capture";

const mailbox = async (page: Page) => {
  await page.goto("/inbox");
  await page
    .getByLabel("Choose your permanent address")
    .fill(`inbox-${Date.now()}`);
  await page
    .getByRole("button", { name: "Claim address", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "New email" })).toBeVisible();
  const token = await page.evaluate(() =>
    localStorage.getItem("froggy.local-identity")
  );
  const response = await page.request.get("/api/email/status", {
    headers: { authorization: `Bearer ${token}` },
  });
  const status = Schema.decodeUnknownSync(EmailStatus)(await response.json());
  if (!status.mailbox) {
    throw new Error("The test mailbox was not created.");
  }
  return status.mailbox.conversationId;
};

const receivedMessages = async (page: Page) => {
  const conversationId = await mailbox(page);
  const attachment = EmailFileId.generate();
  const messages: EmailMessage[] = Array.from({ length: 12 }, (_, index) => ({
    kind: "message",
    id: EmailId.generate(),
    conversationId,
    from: "quotes@example.com",
    to: ["froggy@example.com"],
    cc: [],
    subject:
      index === 0
        ? "Your installation quote and next steps"
        : `Project update ${index}`,
    text:
      index === 0
        ? `${"A detailed update with enough text to read comfortably.\n\n".repeat(35)}The final line must remain reachable.`
        : `Update ${index}: everything is on schedule.`,
    files: index === 0 ? [attachment] : [],
    messageId: `test-${index}`,
    references: [],
    deduplicationKey: `test-${index}`,
    createdAt: Date.now() - index * 60_000,
    read: false,
    deleted: false,
    automatic: false,
    truncated: false,
    stubbed: true,
  }));
  const reads: string[] = [];
  await page.route("**/api/email/messages?*", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    const before = url.searchParams.get("before") ?? "";
    const matching = messages.filter((message) => message.subject.includes(q));
    await route.fulfill({
      json: {
        v: 1,
        messages: before ? matching.slice(8) : matching.slice(0, 8),
        drafts: [],
        files: [],
        waits: [],
        cursor: before || q ? null : "older-page",
      },
    });
  });
  await page.route("**/api/email/messages/eml_*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    const message = messages.find((entry) => entry.id === id);
    if (!message) {
      await route.fulfill({
        status: 404,
        json: { error: "Email unavailable" },
      });
      return;
    }
    messages[messages.indexOf(message)] = { ...message, read: true };
    reads.push(message.id);
    await route.fulfill({
      json: { v: 1, message: { ...message, read: true } },
    });
  });
  await page.route(`**/api/email/files/${attachment}`, async (route) => {
    await route.fulfill({
      contentType: "text/plain",
      headers: {
        "content-disposition":
          "attachment; filename*=UTF-8''installation-quote.txt",
      },
      body: "A quote attachment from an older message.",
    });
  });
  await page.reload();
  return { messages, reads, conversationId };
};

for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  test(`Inbox has independent reading space at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    await page.setViewportSize({ width, height: 900 });
    const { reads } = await receivedMessages(page);
    const list = page.getByRole("region", { name: "Email list" });
    await expect(list.getByRole("link")).toHaveCount(8);
    expect(reads).toHaveLength(0);
    const heights = await list
      .getByRole("link")
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height)
      );
    expect(heights.every((height) => height > 90)).toBe(true);
    await list.getByRole("link").first().click();
    const reader = page.getByRole("region", { name: "Email reader" });
    await expect(
      reader.getByRole("heading", {
        name: "Your installation quote and next steps",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true })
    ).toHaveCount(0);
    await (width < 1024
      ? expect(list).toBeHidden()
      : expect(list).toBeVisible());
    await expect.poll(() => reads.length).toBe(1);
    const file = reader.getByRole("button", { name: "Attachment 1" });
    await file.scrollIntoViewIfNeeded();
    await expect(file).toBeInViewport();
    const download = page.waitForEvent("download");
    await file.click();
    const downloaded = await download;
    expect(downloaded.suggestedFilename()).toBe("installation-quote.txt");
    await reader.evaluate((element) => {
      element.scrollTop = 0;
    });
    await captureScreen(page, testInfo, "inbox-reader");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    if (width < 1024) {
      await reader.getByRole("link", { name: "Inbox", exact: true }).click();
    }
    await list
      .getByRole("textbox", { name: "Search received messages" })
      .fill("Project update 7");
    await expect(list.getByRole("link")).toHaveCount(1);
    await list
      .getByRole("textbox", { name: "Search received messages" })
      .fill("");
    await list.getByRole("button", { name: "Older", exact: true }).click();
    await expect(list.getByRole("link")).toHaveCount(4);
    await list.getByRole("link").first().click();
    await expect(
      reader.getByRole("heading", { name: "Project update 8", exact: true })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("Ask Froggy preserves an unsent chat and sets removable context without sending", async ({
  page,
}) => {
  const { conversationId } = await receivedMessages(page);
  await page.goto(`/chat/${conversationId}`);
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Compare this with my earlier quote.");
  await page.getByRole("banner").click();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Inbox", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Email list" })
    .getByRole("link")
    .first()
    .click();
  await page.getByRole("button", { name: "Ask Froggy", exact: true }).click();
  await expect(composer).toHaveValue("Compare this with my earlier quote.");
  await expect(
    page.getByText("Email: Your installation quote and next steps", {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop the run" })).toHaveCount(
    0
  );
  await page.getByRole("button", { name: "Remove email context" }).click();
  await expect(composer).toHaveValue("Compare this with my earlier quote.");
  await expect(
    page.getByRole("button", { name: "Remove email context" })
  ).toHaveCount(0);
});

test("an unsaved email survives route changes and Cancel clears it", async ({
  page,
}) => {
  await mailbox(page);
  await page.getByRole("button", { name: "New email" }).click();
  await page.getByLabel("To", { exact: true }).fill("recipient@example.com");
  await page.getByLabel("Subject", { exact: true }).fill("An unfinished draft");
  await page
    .getByLabel("Message", { exact: true })
    .fill("I will finish this after checking my Watchlist.");
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Watchlist", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "New email" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "An unfinished draft"
  );
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "I will finish this after checking my Watchlist."
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "New email" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("");
});

interface SessionController {
  change?: () => void;
}

test("a workspace session change clears unsent email fields", async ({
  page,
}) => {
  const controller: SessionController = {};
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      socket.send(message);
      const decoded = decodeAppServerMessage(message);
      if (
        decoded._tag === "Success" &&
        decoded.success.type === "session.welcome"
      ) {
        const welcome = decoded.success;
        controller.change = () => {
          socket.send(
            encodeAppServerMessage({
              ...welcome,
              sessionId: SessionId.generate(),
            })
          );
        };
      }
    });
  });
  const release = Promise.withResolvers<null>();
  const started = Promise.withResolvers<null>();
  await page.route("**/api/email/files", async (route) => {
    started.resolve(null);
    await release.promise;
    await route.fulfill({
      json: {
        v: 1,
        file: {
          kind: "file",
          id: EmailFileId.generate(),
          name: "private.txt",
          mime: "text/plain",
          size: 7,
          hash: "test",
          createdAt: Date.now(),
          deleted: false,
          stubbed: true,
        },
      },
    });
  });
  await mailbox(page);
  await page.getByRole("button", { name: "New email" }).click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Private unsent subject");
  await page.getByLabel("Attachments (0)", { exact: true }).setInputFiles({
    name: "private.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private"),
  });
  await started.promise;
  try {
    controller.change?.();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("");
    const uploaded = page.waitForResponse("**/api/email/files");
    release.resolve(null);
    await uploaded;
    await expect(
      page.getByLabel("Attachments (0)", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("");
  } finally {
    release.resolve(null);
  }
});
