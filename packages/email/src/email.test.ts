import { describe, expect, test } from "bun:test";

import { ConversationId, RunId, userId } from "@froggy/domain";

import { emailSignature, sha256, verifyEmailSignature } from "./auth";
import { makeEmailDocument, readEmailPdf } from "./documents";
import { Email } from "./email";
import { memoryEmailStore } from "./store";
import { memoryEmailTransport } from "./transport";

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected rejection but operation succeeded.");
};
const alice = userId("did:privy:email-alice");
const bob = userId("did:privy:email-bob");
const setup = async () => {
  const store = memoryEmailStore();
  const transport = memoryEmailTransport();
  const email = new Email({ store, transport, domain: "froggy.test" });
  const mailbox = await email.claim(alice, "alice");
  await email.claim(bob, "bobby");
  return { email, mailbox, transport, store };
};
const receive = async (
  email: Email,
  to = "alice@froggy.test",
  extra = "",
  body = "Hello Alice"
) => {
  const bytes = new TextEncoder().encode(
    `From: sender@example.com\r\nTo: ${to}\r\nSubject: A quote\r\nMessage-ID: <original@example.com>\r\n${extra}\r\n${body}`
  );
  const key = await sha256(
    new TextEncoder().encode(`${to}\0${await sha256(bytes)}`)
  );
  await email.transport.put(`raw-${key}`, bytes);
  return await email.ingest({
    v: 1,
    key,
    to,
    from: "sender@example.com",
    size: bytes.length,
  });
};
const draftInput = (conversationId: ConversationId) => ({
  conversationId,
  to: ["friend@example.com"],
  cc: [],
  bcc: [],
  subject: "Hello",
  text: "Please send a quote.",
  files: [],
  replyTo: null,
});

describe("email ownership and delivery", () => {
  test("claims are unique and retired handles stay reserved", async () => {
    const { email } = await setup();
    expect(await rejection(email.claim(bob, "alice"))).toContain("");
    await email.disable(alice);
    expect(await email.recipient("alice@froggy.test")).toBeNull();
    expect(await rejection(email.claim(bob, "alice"))).toContain("");
    expect(await rejection(email.claim(alice, "new-name"))).toContain(
      "permanent"
    );
  });
  test("reserved names and malformed handles are rejected", async () => {
    const { email } = await setup();
    expect(
      await rejection(email.claim(userId("did:privy:new"), "support"))
    ).toContain("reserved");
    expect(
      await rejection(email.claim(userId("did:privy:new"), "bad@name"))
    ).toContain("");
  });
  test("routes only the configured domain and known aliases", async () => {
    const { email } = await setup();
    expect(await email.recipient("alice@evil.test")).toBeNull();
    expect(await email.recipient("alice+unknown@froggy.test")).toBeNull();
    expect(await email.recipient("ALICE@FROGGY.TEST")).toBe(alice);
  });
  test("deduplicates intake and tombstones survive replay", async () => {
    const { email } = await setup();
    const first = await receive(email);
    expect(first.message).not.toBeNull();
    const resolvedEmail0 = await receive(email);
    expect(resolvedEmail0.message).toBeNull();
    if (!first.message) {
      throw new Error("Missing message");
    }
    await email.remove(alice, first.message.id);
    const resolvedEmail1 = await receive(email);
    expect(resolvedEmail1.message).toBeNull();
    const resolvedEmail2 = await email.page(alice);
    expect(resolvedEmail2.messages).toHaveLength(0);
  });
  test("another user cannot read a message, file or draft", async () => {
    const { email, mailbox } = await setup();
    const outcome = await receive(email);
    if (!outcome.message) {
      throw new Error("Missing message");
    }
    expect(await rejection(email.read(bob, outcome.message.id))).toContain("");
    const file = await email.upload(
      alice,
      "private.txt",
      "text/plain",
      new TextEncoder().encode("secret")
    );
    expect(await rejection(email.file(bob, file.id))).toContain("");
    const draft = await email.draft(alice, draftInput(mailbox.conversationId));
    expect(
      await rejection(email.approve(bob, draft.id, draft.revision))
    ).toContain("");
  });
  test("parses HTML-only mail as inert text", async () => {
    const { email } = await setup();
    const outcome = await receive(
      email,
      undefined,
      "Content-Type: text/html\r\n",
      "<script>pay()</script><p>Hello &amp; welcome</p>"
    );
    expect(outcome.message?.text).toContain("Hello & welcome");
    expect(outcome.message?.text).not.toContain("pay()");
  });
  test("maps late mail to the saved conversation without starting work", async () => {
    const { email } = await setup();
    const conversation = ConversationId.generate();
    const wait = await email.wait(
      alice,
      conversation,
      RunId.generate(),
      "example.com"
    );
    const outcome = await receive(email, `${wait.alias}@froggy.test`);
    expect(outcome.message?.conversationId).toBe(conversation);
    const resolvedEmail3 = await email.waitStatus(alice, wait.id);
    expect(resolvedEmail3.status).toBe("received");
  });
  test("autoresponders do not satisfy a wait", async () => {
    const { email } = await setup();
    const wait = await email.wait(
      alice,
      ConversationId.generate(),
      RunId.generate(),
      "example.com"
    );
    await receive(
      email,
      `${wait.alias}@froggy.test`,
      "Auto-Submitted: auto-replied\r\n"
    );
    const resolvedEmail4 = await email.waitStatus(alice, wait.id);
    expect(resolvedEmail4.status).toBe("waiting");
  });
  test("draft creation has no sending side effect and double approval sends once", async () => {
    const { email, transport, mailbox } = await setup();
    let calls = 0;
    transport.send = async () => {
      calls += 1;
      return await Promise.resolve("<sent@example.com>");
    };
    const draft = await email.draft(alice, draftInput(mailbox.conversationId));
    expect(calls).toBe(0);
    await Promise.all([
      email.approve(alice, draft.id, 1),
      email.approve(alice, draft.id, 1),
    ]);
    expect(calls).toBe(1);
    const resolvedEmail5 = await email.draftStatus(alice, draft.id);
    expect(resolvedEmail5.providerId).toBe("<sent@example.com>");
  });
  test("old revisions cannot approve edited content", async () => {
    const { email, mailbox } = await setup();
    const input = draftInput(mailbox.conversationId);
    const original = await email.draft(alice, input);
    await email.draft(
      alice,
      { ...input, text: "Different message" },
      original.id,
      1
    );
    expect(await rejection(email.approve(alice, original.id, 1))).toContain(
      "changed"
    );
  });
  test("another user cannot delete a private attachment object", async () => {
    const { email } = await setup();
    const file = await email.upload(
      alice,
      "private.txt",
      "text/plain",
      new TextEncoder().encode("private")
    );
    await email.removeFile(bob, file.id);
    const owned = await email.file(alice, file.id);
    expect(new TextDecoder().decode(owned.bytes)).toBe("private");
  });
  test("reply aliases preserve the task conversation without provider-specific Message-IDs", async () => {
    const { email } = await setup();
    const conversationId = ConversationId.generate();
    const draft = await email.draft(alice, draftInput(conversationId));
    await email.approve(alice, draft.id, 1);
    const address = `alice+${draft.id}@froggy.test`;
    expect(await email.recipient(address)).toBe(alice);
    const incoming = await receive(email, address);
    expect(incoming.message?.conversationId).toBe(conversationId);
  });
  test("pagination does not skip messages received in the same millisecond", async () => {
    const { store, transport } = await setup();
    const email = new Email({
      store,
      transport,
      domain: "froggy.test",
      now: () => 123_456_789,
    });
    await Promise.all(
      Array.from(
        { length: 25 },
        async (_, index) =>
          await receive(email, "alice@froggy.test", "", `Message ${index}`)
      )
    );
    const first = await email.page(alice);
    const second = await email.page(
      alice,
      undefined,
      "",
      first.cursor ?? undefined
    );
    expect(first.messages).toHaveLength(20);
    expect(second.messages).toHaveLength(5);
    expect(
      new Set(
        [...first.messages, ...second.messages].map((message) => message.id)
      ).size
    ).toBe(25);
  });
  test("removed attachments invalidate approval", async () => {
    const { email, mailbox } = await setup();
    const file = await email.upload(
      alice,
      "quote.txt",
      "text/plain",
      new TextEncoder().encode("quote")
    );
    const draft = await email.draft(alice, {
      ...draftInput(mailbox.conversationId),
      files: [file.id],
    });
    await email.removeFile(alice, file.id);
    expect(await rejection(email.approve(alice, draft.id, 1))).toContain(
      "unavailable"
    );
  });
  test("unknown provider outcomes are never automatically resent", async () => {
    const { email, transport, mailbox } = await setup();
    let calls = 0;
    transport.send = async () => {
      calls += 1;
      return await Promise.reject(new Error("timeout"));
    };
    const draft = await email.draft(alice, draftInput(mailbox.conversationId));
    const resolvedEmail6 = await email.approve(alice, draft.id, 1);
    expect(resolvedEmail6.status).toBe("uncertain");
    await email.approve(alice, draft.id, 1);
    expect(calls).toBe(1);
  });
  test("recovers an acknowledged send without resending after a lost response", async () => {
    const { store, transport, mailbox } = await setup();
    let now = Date.now();
    let calls = 0;
    const email = new Email({
      store,
      transport,
      domain: "froggy.test",
      now: () => now,
    });
    transport.send = async () => {
      calls += 1;
      return await Promise.reject(new Error("lost response"));
    };
    transport.lookup = async () => await Promise.resolve("recovered-message");
    const draft = await email.draft(alice, draftInput(mailbox.conversationId));
    await email.approve(alice, draft.id, 1);
    now += 121_000;
    await email.maintain();
    const recovered = await email.draftStatus(alice, draft.id);
    expect(recovered.status).toBe("accepted");
    expect(recovered.providerId).toBe("recovered-message");
    expect(calls).toBe(1);
  });
  test("only marks a multi-recipient email delivered after every recipient", async () => {
    const { email, mailbox } = await setup();
    const draft = await email.draft(alice, {
      ...draftInput(mailbox.conversationId),
      cc: ["second@example.com"],
    });
    const accepted = await email.approve(alice, draft.id, 1);
    if (accepted.providerId === null) {
      throw new Error("Missing provider ID");
    }
    await email.delivery(
      accepted.providerId,
      "friend@example.com",
      "delivered"
    );
    const partial = await email.draftStatus(alice, draft.id);
    expect(partial.status).toBe("accepted");
    await email.delivery(
      accepted.providerId,
      "second@example.com",
      "delivered"
    );
    const complete = await email.draftStatus(alice, draft.id);
    expect(complete.status).toBe("delivered");
  });
  test("deleting a conversation cannot reset the daily sending quota", async () => {
    const { email, mailbox } = await setup();
    const recipients = Array.from(
      { length: 10 },
      (_, index) => `recipient${index}@example.com`
    );
    const first = await email.draft(alice, {
      ...draftInput(mailbox.conversationId),
      to: recipients,
      cc: recipients,
    });
    await email.approve(alice, first.id, 1);
    await email.removeConversation(alice, mailbox.conversationId);
    const next = await email.draft(alice, {
      ...draftInput(ConversationId.generate()),
      to: recipients,
    });
    expect(await rejection(email.approve(alice, next.id, 1))).toContain(
      "quota"
    );
  });
  test("enforces encoded outbound size before sending", async () => {
    const { email, mailbox } = await setup();
    const file = await email.upload(
      alice,
      "big.txt",
      "text/plain",
      new Uint8Array(4 * 1024 * 1024)
    );
    expect(
      await rejection(
        email.draft(alice, {
          ...draftInput(mailbox.conversationId),
          files: [file.id],
        })
      )
    ).toContain("5 MiB");
  });
  test("signed webhooks bind path, method, payload and time", async () => {
    const secret = "test-secret-with-at-least-thirty-two-characters";
    const body = new TextEncoder().encode("hello");
    const headers = await emailSignature(
      secret,
      "POST",
      "/inbound",
      body,
      1000
    );
    const request = new Request("https://example.test/inbound", {
      method: "POST",
      headers,
    });
    expect(await verifyEmailSignature(secret, request, body, 1000)).toBe(true);
    expect(
      await verifyEmailSignature(secret, request, new Uint8Array(), 1000)
    ).toBe(false);
    expect(await verifyEmailSignature(secret, request, body, 400_000)).toBe(
      false
    );
  });
  test("generates and reads a PDF in the bounded process", async () => {
    const bytes = await makeEmailDocument("An invoice for 42 euros", "pdf");
    const read = await readEmailPdf(bytes, 1);
    expect(read.text).toContain("42 euros");
    expect(read.pages).toBe(1);
  });
});
