import type { EmailWorkerSend } from "@froggy/protocol";
import { EmailSendResult } from "@froggy/protocol";
import { Redacted, Schema } from "effect";

import { boundedEmailBody, emailSignature } from "./auth";

const pathFor = (key: string) => `/objects/${encodeURIComponent(key)}`;

export interface EmailTransport {
  readonly stubbed: boolean;
  put: (key: string, bytes: Uint8Array) => Promise<void>;
  get: (key: string) => Promise<Uint8Array>;
  remove: (key: string) => Promise<void>;
  lookup: (id: string) => Promise<string | null>;
  send: (input: typeof EmailWorkerSend.Type) => Promise<string>;
}
export const memoryEmailTransport = (): EmailTransport => {
  const blobs = new Map<string, Uint8Array>();
  return {
    stubbed: true,
    put: async (key, bytes) => {
      blobs.set(key, new Uint8Array(bytes));
      await Promise.resolve();
    },
    get: async (key) => {
      const bytes = blobs.get(key);
      if (!bytes) {
        return await Promise.reject(new Error("File unavailable."));
      }
      return await Promise.resolve(new Uint8Array(bytes));
    },
    remove: async (key) => {
      blobs.delete(key);
      await Promise.resolve();
    },
    lookup: async () => await Promise.resolve(null),
    send: async () => await Promise.resolve(`stub-${crypto.randomUUID()}`),
  };
};
export const cloudflareEmailTransport = (
  url: string,
  secret: Redacted.Redacted
): EmailTransport => {
  const call = async (
    method: string,
    path: string,
    bytes: Uint8Array = new Uint8Array()
  ): Promise<Response> => {
    const headers = await emailSignature(
      Redacted.value(secret),
      method,
      path,
      bytes
    );
    const init: RequestInit = {
      method,
      headers,

      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    };
    if (method !== "GET") {
      init.body = new Uint8Array(bytes);
    }
    const response = await fetch(new URL(path, url), init);
    if (!response.ok) {
      throw new Error(`Email transport returned HTTP ${response.status}.`);
    }
    return response;
  };

  return {
    stubbed: false,
    get: async (key) =>
      await boundedEmailBody(await call("GET", pathFor(key)), 25 * 1024 * 1024),
    put: async (key, bytes) => {
      await call("PUT", pathFor(key), bytes);
    },
    remove: async (key) => {
      await call("DELETE", pathFor(key));
    },
    lookup: async (id) => {
      const response = await call("GET", `/sends/${encodeURIComponent(id)}`);
      const bytes = await boundedEmailBody(response, 8192);
      return Schema.decodeUnknownSync(
        Schema.Struct({
          v: Schema.Literal(1),
          messageId: Schema.NullOr(Schema.String),
        })
      )(JSON.parse(new TextDecoder().decode(bytes))).messageId;
    },
    send: async (input) => {
      const response = await call(
        "POST",
        "/send",
        new TextEncoder().encode(JSON.stringify(input))
      );
      const bytes = await boundedEmailBody(response, 8192);
      return Schema.decodeUnknownSync(EmailSendResult)(
        JSON.parse(new TextDecoder().decode(bytes))
      ).messageId;
    },
  };
};
