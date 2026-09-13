import { beforeAll, expect, spyOn, test } from "bun:test";

import { userId } from "@froggy/domain";
import type { OAuthScope } from "@froggy/domain";
import { Effect } from "effect";

import { canUseTool } from "./capabilities";
import {
  emailToolDefinitions,
  emailPromptContext,
  invokeEmailTool,
  readEmailAttachment,
} from "./email-tools";
import { loadEnvironment } from "./environment";
import type { Environment } from "./environment";
import { createServices } from "./services";

let environment: Environment;
beforeAll(async () => {
  Object.assign(process.env, {
    APP_ORIGIN: "http://127.0.0.1:3000",
    DATABASE_URL: "",
    EMAIL_DOMAIN: "",
    EMAIL_WORKER_URL: "",
    EMAIL_WEBHOOK_SECRET: "",
    HEDERA_ACCOUNT_ID: "0.0.0",
    HEDERA_PRIVATE_KEY: "0xREPLACE_ME",
    GRAPH_API_KEY: "REPLACE_ME_GRAPH_STUDIO_KEY",
    PRIVY_APP_ID: "REPLACE_ME_PRIVY_APP_ID",
    PRIVY_APP_SECRET: "REPLACE_ME_PRIVY_APP_SECRET",
  });
  environment = await Effect.runPromise(loadEnvironment());
});
const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected refusal");
};
test("legacy and drafting-only clients cannot read attachments", async () => {
  const services = createServices({ environment });
  const person = userId("did:privy:email-tools-owner");
  const { email } = services;
  if (email === null) {
    throw new Error("Expected local email stub");
  }
  await email.claim(person, "mail-tools");
  const file = await email.upload(
    person,
    "quote.txt",
    "text/plain",
    new TextEncoder().encode("Private quote")
  );
  expect(
    await failure(
      invokeEmailTool(
        services,
        person,
        "froggy_email_file_read",
        { id: file.id },
        null
      )
    )
  ).toContain("email:read");
  expect(
    await failure(
      invokeEmailTool(
        services,
        person,
        "froggy_email_file_read",
        { id: file.id },
        new Set(["email:draft"])
      )
    )
  ).toContain("email:read");
  const output = await invokeEmailTool(
    services,
    person,
    "froggy_email_file_read",
    { id: file.id },
    new Set(["email:read"])
  );
  expect(output).not.toContain("Private quote");
  const content = await readEmailAttachment(services, person, { id: file.id });
  expect(content.text).toContain("Private quote");
  expect(content.text).toContain("UNTRUSTED EMAIL DATA");
  expect(
    await failure(
      readEmailAttachment(services, userId("did:privy:other-owner"), {
        id: file.id,
      })
    )
  ).toContain("unavailable");
  expect(
    emailToolDefinitions.some((definition) =>
      /approve|send/u.test(definition.name)
    )
  ).toBe(false);
});
test("image reads return bounded model-ready content without an extra model call", async () => {
  const services = createServices({ environment });
  const person = userId("did:privy:email-image-owner");
  const { email } = services;
  if (email === null) {
    throw new Error("Expected local email stub");
  }
  await email.claim(person, "mail-image");
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=";
  const file = await email.upload(
    person,
    "pixel.png",
    "image/png",
    new Uint8Array(Buffer.from(data, "base64"))
  );
  const content = await readEmailAttachment(services, person, { id: file.id });
  expect(content.images).toEqual([{ mimeType: "image/png", data }]);
});

test("mailbox context respects tool permissions and does not read denied mailboxes", async () => {
  const { email } = createServices({ environment });
  if (email === null) {
    throw new Error("Expected local email stub");
  }
  const owner = userId("did:privy:email-context-owner");
  await email.claim(owner, "context-owner");
  const status = spyOn(email, "status");
  const denied = await Promise.all(
    [new Set<OAuthScope>(), new Set(["email:draft"] as const)].map(
      async (scopes) =>
        await emailPromptContext(
          email,
          owner,
          canUseTool("email_address", "browse", scopes)
        )
    )
  );
  for (const context of denied) {
    expect(context).not.toContain("context-owner@");
    expect(context).toContain("not available");
  }
  expect(status).not.toHaveBeenCalled();
  const allowed = await Promise.all(
    [null, new Set(["email:read"] as const)].map(
      async (scopes) =>
        await emailPromptContext(
          email,
          owner,
          canUseTool("email_address", "browse", scopes)
        )
    )
  );
  for (const context of allowed) {
    expect(context).toContain("context-owner@");
    expect(context).toContain('"stubbed":true');
    expect(context).not.toContain("unread");
  }
  await email.disable(owner);
  expect(await emailPromptContext(email, owner, true)).toContain("No active");
  expect(
    await emailPromptContext(email, userId("did:privy:no-mailbox"), true)
  ).toContain("No active");
  expect(await emailPromptContext(null, owner, true)).toContain(
    "not configured"
  );
  status.mockRejectedValue(new Error("Private internal failure"));
  const context = await emailPromptContext(email, owner, true);
  expect(context).toContain("could not be loaded");
  expect(context).not.toContain("Private internal failure");
  status.mockRestore();
});
