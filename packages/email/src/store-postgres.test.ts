import { afterAll, expect, test } from "bun:test";

import { ConversationId, userId } from "@froggy/domain";
import postgres from "postgres";

import { Email } from "./email";
import { postgresEmailStore } from "./store";
import { memoryEmailTransport } from "./transport";

const databaseUrl = process.env["FROGGY_TEST_DATABASE_URL"];
const suite = (url: string) => {
  const first = postgres(url, { max: 2 });
  const second = postgres(url, { max: 2 });
  // Reproduce Drizzle's serializer overrides on the server's shared Postgres pool.
  first.options.serializers[114] = (value) => value;
  first.options.serializers[3802] = (value) => value;
  afterAll(async () => {
    await Promise.all([first.end(), second.end()]);
  });
  test("Postgres serializes mailbox claims and exact approval across independent pools", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const alice = userId(`did:privy:mail-pg-a-${suffix}`);
    const bob = userId(`did:privy:mail-pg-b-${suffix}`);
    const transport = memoryEmailTransport();
    let sends = 0;
    transport.send = async () => {
      sends += 1;
      return await Promise.resolve("pg-provider-message");
    };
    const a = new Email({
      store: postgresEmailStore(first),
      transport,
      domain: "froggy.test",
    });
    const b = new Email({
      store: postgresEmailStore(second),
      transport,
      domain: "froggy.test",
    });
    const outcomes = await Promise.allSettled([
      a.claim(alice, `mail-${suffix}`),
      b.claim(bob, `mail-${suffix}`),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const owner = await a.store.owner(`mail-${suffix}`);
    if (owner === null) {
      throw new Error("Mailbox owner missing");
    }
    const draft = await b.draft(owner, {
      conversationId: ConversationId.generate(),
      to: ["recipient@example.com"],
      cc: [],
      bcc: [],
      subject: "Durable approval",
      text: "The reviewed text",
      files: [],
      replyTo: null,
    });
    await Promise.all([
      a.approve(owner, draft.id, 1),
      b.approve(owner, draft.id, 1),
    ]);
    expect(sends).toBe(1);
    const recovered = await b.draftStatus(owner, draft.id);
    expect(recovered.providerId).toBe("pg-provider-message");
    const other = owner === alice ? bob : alice;
    const otherRecords = await b.store.transaction(
      other,
      async (tx) => await tx.list("draft")
    );
    expect(otherRecords).toHaveLength(0);
  });
};
if (databaseUrl === undefined || databaseUrl === "") {
  test.skip("Postgres email persistence requires FROGGY_TEST_DATABASE_URL", () => {});
} else {
  suite(databaseUrl);
}
