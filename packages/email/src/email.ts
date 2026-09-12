import {
  ConversationId,
  EmailDraftId,
  EmailDraftInput,
  EmailFileId,
  EmailHandle,
  EmailId,
  EmailWaitId,
  MailboxId,
} from "@froggy/domain";
import type {
  EmailFile,
  EmailMessage,
  EmailWait,
  Mailbox,
  RunId,
  UserId,
  EmailDraft,
} from "@froggy/domain";
import type { EmailInbound } from "@froggy/protocol";
import { Effect, Schema } from "effect";
import PostalMime from "postal-mime";

import { sha256 } from "./auth";
import type { EmailStore, EmailTransaction } from "./store";
import type { EmailTransport } from "./transport";

const RESERVED = new Set([
  "admin",
  "abuse",
  "postmaster",
  "support",
  "security",
  "billing",
  "contact",
  "info",
  "mail",
  "email",
  "froggy",
  "noreply",
  "no-reply",
  "root",
  "hostmaster",
  "webmaster",
]);
export const EMAIL_STORAGE_LIMIT = 1024 ** 3;
export const EMAIL_DAILY_LIMIT = 25;
const TEXT_LIMIT = 64_000;
const requireMailbox = (tx: EmailTransaction): Mailbox => {
  if (tx.mailbox?.active !== true) {
    throw new Error("Enable your email address first.");
  }
  return tx.mailbox;
};
const fileFrom = async (
  tx: EmailTransaction,
  id: EmailFileId
): Promise<EmailFile> => {
  const file = await tx.get(id);
  if (file?.kind !== "file" || file.deleted) {
    throw new Error("Attachment unavailable.");
  }
  return file;
};
const incrementStorage = (tx: EmailTransaction, bytes: number) => {
  const box = requireMailbox(tx);
  if (box.usedBytes + bytes > EMAIL_STORAGE_LIMIT) {
    throw new Error(
      "Your email storage is full. Delete messages or attachments to receive more."
    );
  }
  tx.mailbox = { ...box, usedBytes: Math.max(0, box.usedBytes + bytes) };
};
const referencesOf = (value: string | undefined): string[] =>
  (value?.match(/<[^<>\r\n]{1,200}>/gu) ?? []).slice(-50);
const htmlText = (html: string): string =>
  html
    .replaceAll(/<(?<tag>script|style)\b[^>]*>[\s\S]*?<\/\k<tag>>/giu, "")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&nbsp;/giu, " ")
    .replaceAll(/&amp;/giu, "&")
    .replaceAll(/&lt;/giu, "<")
    .replaceAll(/&gt;/giu, ">")
    .replaceAll("&#39;", "'")
    .replaceAll(/&quot;/giu, '"');
const recordBytes = (text: string) => new TextEncoder().encode(text).length;
export interface EmailOptions {
  readonly store: EmailStore;
  readonly transport: EmailTransport;
  readonly domain: string;
  readonly now?: () => number;
}
export class Email {
  readonly store: EmailStore;
  readonly transport: EmailTransport;
  readonly domain: string;
  readonly now: () => number;
  constructor(options: EmailOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.domain = options.domain.toLowerCase();
    this.now = options.now ?? Date.now;
  }
  async status(userId: UserId) {
    return await this.store.transaction(userId, async (tx) => {
      const resolvedEmail = await tx.list("message");
      return {
        v: 1 as const,
        mailbox: tx.mailbox,
        address: tx.mailbox ? `${tx.mailbox.handle}@${this.domain}` : null,
        storageLimit: EMAIL_STORAGE_LIMIT,
        dailyLimit: EMAIL_DAILY_LIMIT,
        unread: resolvedEmail.filter(
          (row) => row.kind === "message" && !row.read && !row.deleted
        ).length,
        stubbed: this.transport.stubbed,
      };
    });
  }
  async claim(userId: UserId, handle: string): Promise<Mailbox> {
    const valid = Schema.decodeUnknownSync(EmailHandle)(handle);
    if (RESERVED.has(valid)) {
      throw new Error("That address is reserved.");
    }
    const owner = await this.store.owner(valid);
    if (owner && owner !== userId) {
      throw new Error("That address is already claimed.");
    }
    return await this.store.transaction(userId, async (tx) => {
      if (tx.mailbox && tx.mailbox.handle !== valid) {
        throw new Error("Your address is permanent.");
      }
      tx.mailbox = tx.mailbox
        ? { ...tx.mailbox, active: true }
        : {
            id: MailboxId.generate(),
            handle: valid,
            active: true,
            conversationId: ConversationId.generate(),
            createdAt: this.now(),
            usedBytes: 0,
            stubbed: this.transport.stubbed,
          };
      return await Promise.resolve(tx.mailbox);
    });
  }
  async disable(userId: UserId): Promise<void> {
    await this.store.transaction(userId, async (tx) => {
      if (tx.mailbox) {
        tx.mailbox = { ...tx.mailbox, active: false };
      }
      await Effect.runPromise(
        Effect.forEach(
          await tx.list("wait"),
          (row) =>
            Effect.promise(async () => {
              if (row.kind === "wait" && row.status === "waiting") {
                await tx.put({ ...row, status: "cancelled" });
              }
            }),
          { concurrency: 1 }
        )
      );
    });
  }
  async recipient(address: string): Promise<UserId | null> {
    const [local, domain, extra] = address.toLowerCase().split("@");
    if (
      local === undefined ||
      local === "" ||
      domain !== this.domain ||
      extra !== undefined
    ) {
      return null;
    }
    const [handle, alias] = local.split("+");
    if (handle === undefined || handle === "") {
      return null;
    }
    const userId = await this.store.owner(handle);
    if (!userId) {
      return null;
    }
    return await this.store.transaction(userId, async (tx) => {
      if (
        tx.mailbox?.active !== true ||
        tx.mailbox.usedBytes >= EMAIL_STORAGE_LIMIT
      ) {
        return null;
      }
      const resolvedEmail1 = [
        ...(await tx.list("wait")),
        ...(await tx.list("draft")),
      ];
      if (
        alias !== undefined &&
        !resolvedEmail1.some(
          (row) =>
            (row.kind === "wait" && row.alias === local) ||
            (row.kind === "draft" &&
              !row.deleted &&
              local === `${tx.mailbox?.handle}+${row.id}`)
        )
      ) {
        return null;
      }
      return userId;
    });
  }
  async upload(
    userId: UserId,
    name: string,
    mime: string,
    bytes: Uint8Array
  ): Promise<EmailFile> {
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) {
      throw new Error("Files must be between 1 byte and 25 MiB.");
    }
    const id = EmailFileId.generate();
    const file: EmailFile = {
      kind: "file",
      id,
      name: name.replaceAll(/[\r\n/\\]/gu, "_").slice(0, 200) || "attachment",
      mime: mime.slice(0, 100),
      size: bytes.length,
      hash: await sha256(bytes),
      createdAt: this.now(),
      deleted: false,
      stubbed: this.transport.stubbed,
    };
    await this.transport.put(id, bytes);
    try {
      await this.store.transaction(userId, async (tx) => {
        incrementStorage(tx, bytes.length);
        await tx.put(file);
      });
    } catch (error) {
      await this.transport.remove(id);
      throw error;
    }
    return file;
  }
  async file(userId: UserId, id: EmailFileId) {
    const metadata = await this.store.transaction(
      userId,
      async (tx) => await fileFrom(tx, id)
    );
    return { metadata, bytes: await this.transport.get(id) };
  }
  async ingest(
    input: typeof EmailInbound.Type
  ): Promise<{ userId: UserId; message: EmailMessage | null }> {
    const userId = await this.recipient(input.to);
    if (!userId) {
      throw new Error("Recipient unavailable.");
    }
    const existing = await this.store.transaction(userId, async (tx) => {
      const resolvedEmail = await tx.list("message");
      return resolvedEmail.find(
        (row) => row.kind === "message" && row.deduplicationKey === input.key
      );
    });
    if (existing) {
      await this.transport.remove(`raw-${input.key}`);
      return { userId, message: null };
    }
    const raw = await this.transport.get(`raw-${input.key}`);
    if (
      raw.length !== input.size ||
      (await sha256(
        new TextEncoder().encode(
          `${input.to.toLowerCase()}\0${await sha256(raw)}`
        )
      )) !== input.key
    ) {
      throw new Error("Incoming email integrity check failed.");
    }
    const parsed = await PostalMime.parse(raw);
    const text = (parsed.text ?? htmlText(parsed.html ?? "")).slice(
      0,
      TEXT_LIMIT
    );
    const headers = new Map(
      parsed.headers.map((header) => [header.key.toLowerCase(), header.value])
    );
    const references = [
      ...referencesOf(parsed.references),
      ...referencesOf(parsed.inReplyTo),
    ].slice(-50);
    const automatic =
      ![undefined, "no"].includes(
        headers.get("auto-submitted")?.toLowerCase()
      ) ||
      ["bulk", "junk", "auto_reply"].includes(
        headers.get("precedence")?.toLowerCase() ?? ""
      );
    const files: EmailFile[] = [];
    let committed = false;
    try {
      await Effect.runPromise(
        Effect.forEach(
          parsed.attachments.slice(0, 20),
          (attachment) =>
            Effect.promise(async () => {
              files.push(
                await this.upload(
                  userId,
                  attachment.filename ?? "attachment",
                  attachment.mimeType,
                  Schema.is(Schema.String)(attachment.content)
                    ? new TextEncoder().encode(attachment.content)
                    : new Uint8Array(attachment.content)
                )
              );
            }),
          { concurrency: 1 }
        )
      );
      const message = await this.store.transaction(
        userId,
        async (tx): Promise<EmailMessage | null> => {
          const box = requireMailbox(tx);
          const messages = await tx.list("message");
          if (
            messages.some(
              (row) =>
                row.kind === "message" && row.deduplicationKey === input.key
            )
          ) {
            return null;
          }
          const [local] = input.to.split("@");
          const resolvedEmail3 = await tx.list("wait");
          const waits = resolvedEmail3.filter(
            (row): row is EmailWait =>
              row.kind === "wait" &&
              row.alias === local &&
              row.status === "waiting" &&
              row.expiresAt > this.now()
          );
          const matching = waits.length === 1 ? waits[0] : undefined;
          const threaded = [...messages, ...(await tx.list("draft"))].filter(
            (row) =>
              (row.kind === "message" &&
                !row.deleted &&
                references.includes(row.messageId)) ||
              (row.kind === "draft" &&
                !row.deleted &&
                (local === `${box.handle}+${row.id}` ||
                  (row.providerId !== null &&
                    references.includes(row.providerId))))
          );
          const conversations = new Set(
            threaded
              .filter((row) => row.kind === "message" || row.kind === "draft")
              .map((row) => row.conversationId)
          );
          const conversationId =
            matching?.conversationId ??
            (conversations.size === 1 ? [...conversations][0] : undefined) ??
            box.conversationId;
          incrementStorage(tx, recordBytes(text));
          const mail: EmailMessage = {
            kind: "message",
            id: EmailId.generate(),
            conversationId,
            from: input.from,
            to: [input.to],
            cc: [],
            subject: (parsed.subject ?? "(no subject)").slice(0, 998),
            text,
            files: files.map((file) => file.id),
            messageId: (parsed.messageId ?? "").slice(0, 300),
            references,
            deduplicationKey: input.key,
            createdAt: this.now(),
            read: false,
            deleted: false,
            automatic,
            truncated:
              (parsed.text ?? parsed.html ?? "").length > TEXT_LIMIT ||
              parsed.attachments.length > 20,
            stubbed: this.transport.stubbed,
          };
          await tx.put(mail);
          // A wait is only a correlation. Its email body never becomes an instruction.
          if (matching && !automatic) {
            await tx.put({ ...matching, status: "received", emailId: mail.id });
          }
          return mail;
        }
      );
      committed = message !== null;
      if (!message) {
        await Effect.runPromise(
          Effect.forEach(
            files,
            (file) =>
              Effect.promise(async () => {
                await this.removeFile(userId, file.id);
              }),
            { concurrency: 1 }
          )
        );
      }
      await this.transport.remove(`raw-${input.key}`);
      return { userId, message };
    } catch (error) {
      if (committed) {
        throw error;
      }
      await Effect.runPromise(
        Effect.forEach(
          files,
          (file) =>
            Effect.promise(async () => {
              await this.removeFile(userId, file.id);
            }),
          { concurrency: 1 }
        )
      );
      throw error;
    }
  }
  async page(
    userId: UserId,
    conversationId?: ConversationId,
    query = "",
    before?: string
  ) {
    const cursor =
      before === undefined
        ? null
        : Schema.decodeUnknownSync(
            Schema.Tuple([Schema.NumberFromString, EmailId])
          )(before.split(":"));
    return await this.store.transaction(userId, async (tx) => {
      const resolvedEmail4 = await tx.list("message");
      const messages = resolvedEmail4
        .filter(
          (row): row is EmailMessage =>
            row.kind === "message" &&
            !row.deleted &&
            (!conversationId || row.conversationId === conversationId) &&
            (cursor === null ||
              row.createdAt < cursor[0] ||
              (row.createdAt === cursor[0] && row.id < cursor[1])) &&
            `${row.subject} ${row.from} ${row.text}`
              .toLowerCase()
              .includes(query.toLowerCase())
        )
        .toSorted(
          (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
        )
        .slice(0, 20);
      const resolvedEmail5 = await tx.list("draft");
      const drafts = resolvedEmail5
        .filter(
          (row): row is EmailDraft =>
            row.kind === "draft" &&
            !row.deleted &&
            row.status !== "discarded" &&
            (!conversationId || row.conversationId === conversationId)
        )
        .toSorted(
          (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)
        )
        .slice(0, 20);
      const ids = new Set([...messages, ...drafts].flatMap((row) => row.files));
      const resolvedEmail6 = await tx.list("file");
      const files = resolvedEmail6.filter(
        (row): row is EmailFile =>
          row.kind === "file" && !row.deleted && ids.has(row.id)
      );
      const resolvedEmail7 = await tx.list("wait");
      const waits = resolvedEmail7
        .filter(
          (row): row is EmailWait =>
            row.kind === "wait" &&
            row.status !== "cancelled" &&
            row.expiresAt > this.now() &&
            (!conversationId || row.conversationId === conversationId)
        )
        .slice(-20);
      return {
        v: 1 as const,
        messages,
        drafts,
        files,
        waits,
        cursor:
          messages.length === 20
            ? `${messages.at(-1)?.createdAt}:${messages.at(-1)?.id}`
            : null,
      };
    });
  }
  async read(userId: UserId, id: EmailId): Promise<EmailMessage> {
    return await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "message" || row.deleted) {
        throw new Error("Message unavailable.");
      }
      const read = { ...row, read: true };
      await tx.put(read);
      return read;
    });
  }
  async draft(
    userId: UserId,
    input: typeof EmailDraftInput.Type,
    id?: EmailDraftId,
    revision?: number
  ): Promise<EmailDraft> {
    const body = Schema.decodeUnknownSync(EmailDraftInput)(input);
    return await this.store.transaction(userId, async (tx) => {
      requireMailbox(tx);
      const previous = id ? await tx.get(id) : null;
      if (
        id &&
        (previous?.kind !== "draft" ||
          previous.status !== "draft" ||
          previous.revision !== revision)
      ) {
        throw new Error(
          "Draft changed or has already been submitted. Refresh before editing."
        );
      }
      if (body.replyTo) {
        const original = await tx.get(body.replyTo);
        if (original?.kind !== "message" || original.deleted) {
          throw new Error("Reply message unavailable.");
        }
      }
      const files = await Promise.all(
        body.files.map(async (fileId) => await fileFrom(tx, fileId))
      );
      if (new Set([...body.to, ...body.cc, ...body.bcc]).size > 10) {
        throw new Error("At most 10 recipients per message.");
      }
      const encodedBytes = files.reduce(
        (sum, file) => sum + 4 * Math.ceil(file.size / 3) + 2048,
        recordBytes(body.text) + 8192
      );
      if (encodedBytes > 5 * 1024 * 1024) {
        throw new Error(
          "Email and encoded attachments exceed the 5 MiB sending limit."
        );
      }
      incrementStorage(
        tx,
        recordBytes(body.text) -
          (previous?.kind === "draft" ? recordBytes(previous.text) : 0)
      );
      const draft: EmailDraft = {
        ...body,
        kind: "draft",
        id: id ?? EmailDraftId.generate(),
        revision: (previous?.kind === "draft" ? previous.revision : 0) + 1,
        createdAt: previous?.createdAt ?? this.now(),
        updatedAt: this.now(),
        status: "draft",
        deleted: false,
        recipientCount: body.to.length + body.cc.length + body.bcc.length,
        approvedAt: null,
        deliveries: [],
        providerId: null,
        error: null,
        fileHashes: files.map((file) => file.hash),
        stubbed: this.transport.stubbed,
      };
      await tx.put(draft);
      return draft;
    });
  }
  async draftStatus(userId: UserId, id: EmailDraftId): Promise<EmailDraft> {
    const before = await this.store.transaction(
      userId,
      async (tx) => await tx.get(id)
    );
    if (before?.kind !== "draft" || before.deleted) {
      throw new Error("Draft unavailable.");
    }
    let recovered: string | null = null;
    if (
      (before.status === "uncertain" || before.status === "sending") &&
      this.now() - before.updatedAt > 120_000
    ) {
      try {
        recovered = await this.transport.lookup(id);
      } catch {
        /* A lookup failure never authorizes resending. */
      }
    }
    return await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "draft") {
        throw new Error("Draft unavailable.");
      }
      if (
        recovered !== null &&
        (row.status === "sending" || row.status === "uncertain")
      ) {
        const accepted = {
          ...row,
          providerId: recovered,
          status: "accepted" as const,
          error: null,
          updatedAt: this.now(),
        };
        await tx.put(accepted);
        return accepted;
      }
      if (row.status === "sending" && this.now() - row.updatedAt > 120_000) {
        const uncertain = {
          ...row,
          status: "uncertain" as const,
          error:
            "Sending was interrupted. Check delivery before preparing another message.",
        };
        await tx.put(uncertain);
        return uncertain;
      }
      return row;
    });
  }
  async approve(
    userId: UserId,
    id: EmailDraftId,
    revision: number
  ): Promise<EmailDraft> {
    const claimed = await this.store.transaction(userId, async (tx) => {
      const box = requireMailbox(tx);
      const row = await tx.get(id);
      if (row?.kind !== "draft" || row.deleted || row.revision !== revision) {
        throw new Error("The draft changed. Review it again.");
      }
      if (row.status !== "draft") {
        return { draft: row, send: null };
      }
      const files = await Promise.all(
        row.files.map(async (fileId) => await fileFrom(tx, fileId))
      );
      if (files.some((file, index) => file.hash !== row.fileHashes[index])) {
        throw new Error("An attachment changed. Review the draft again.");
      }
      const resolvedEmail8 = await tx.list("draft");
      const attempts = resolvedEmail8.filter(
        (draft): draft is EmailDraft =>
          draft.kind === "draft" &&
          !["draft", "discarded"].includes(draft.status) &&
          (draft.approvedAt ?? 0) > this.now() - 86_400_000
      );
      const used = attempts.reduce(
        (count, draft) => count + draft.recipientCount,
        0
      );
      if (
        used + row.to.length + row.cc.length + row.bcc.length >
        EMAIL_DAILY_LIMIT
      ) {
        throw new Error("Daily email sending quota reached.");
      }
      const original = row.replyTo ? await tx.get(row.replyTo) : null;
      const references =
        original?.kind === "message"
          ? [...original.references, original.messageId]
              .filter(Boolean)
              .slice(-50)
          : [];
      const sending: EmailDraft = {
        ...row,
        status: "sending",
        approvedAt: this.now(),
        updatedAt: this.now(),
      };
      await tx.put(sending);
      return {
        draft: sending,
        send: {
          v: 1 as const,
          id,
          from: `${box.handle}@${this.domain}`,
          to: row.to,
          cc: row.cc,
          bcc: row.bcc,
          subject: row.subject,
          text: row.text,
          files,
          references,
          replyAddress: `${box.handle}+${id}@${this.domain}`,
        },
      };
    });
    if (!claimed.send) {
      return claimed.draft;
    }
    let providerId: string | null = null;
    try {
      providerId = await this.transport.send(claimed.send);
    } catch {
      /* A timeout is not proof that the provider did not send. */
    }
    return await this.store.transaction(userId, async (tx) => {
      const current = await tx.get(id);
      if (current?.kind !== "draft") {
        throw new Error("Send record unavailable.");
      }
      const result: EmailDraft = {
        ...current,
        status: providerId === null ? "uncertain" : "accepted",
        providerId,
        updatedAt: this.now(),
        error:
          providerId === null
            ? "Delivery is uncertain. This message will not be retried automatically."
            : null,
      };
      await tx.put(result);
      return result;
    });
  }
  async delivery(
    providerId: string,
    recipient: string,
    status: "delivered" | "bounced"
  ) {
    let found = false;
    await Effect.runPromise(
      Effect.forEach(
        await this.store.owners(),
        (userId) =>
          Effect.promise(async () => {
            await this.store.transaction(userId, async (tx) => {
              await Effect.runPromise(
                Effect.forEach(
                  await tx.list("draft"),
                  (row) =>
                    Effect.promise(async () => {
                      if (
                        row.kind !== "draft" ||
                        row.providerId !== providerId
                      ) {
                        return;
                      }
                      const recipients = [...row.to, ...row.cc, ...row.bcc];
                      if (!recipients.includes(recipient)) {
                        return;
                      }
                      found = true;
                      const deliveries = [
                        ...row.deliveries.filter(
                          (item) => item.recipient !== recipient
                        ),
                        { recipient, status },
                      ];
                      let aggregate: EmailDraft["status"] = "accepted";
                      if (
                        deliveries.some((item) => item.status === "bounced")
                      ) {
                        aggregate = "bounced";
                      } else if (
                        new Set(deliveries.map((item) => item.recipient))
                          .size === new Set(recipients).size
                      ) {
                        aggregate = "delivered";
                      }
                      await tx.put({
                        ...row,
                        deliveries,
                        status: aggregate,
                        updatedAt: this.now(),
                      });
                    }),
                  { concurrency: 1 }
                )
              );
            });
          }),
        { concurrency: 1 }
      )
    );
    if (!found) {
      throw new Error(
        "Send record is not yet available; retry the delivery event."
      );
    }
  }
  async discard(userId: UserId, id: EmailDraftId, revision: number) {
    await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (
        row?.kind !== "draft" ||
        row.deleted ||
        row.status !== "draft" ||
        row.revision !== revision
      ) {
        throw new Error("Draft changed or was already submitted.");
      }
      if (tx.mailbox) {
        tx.mailbox = {
          ...tx.mailbox,
          usedBytes: Math.max(0, tx.mailbox.usedBytes - recordBytes(row.text)),
        };
      }
      await tx.put({
        ...row,
        status: "discarded",
        text: "",
        files: [],
        fileHashes: [],
        updatedAt: this.now(),
      });
    });
  }
  async removeFile(userId: UserId, id: EmailFileId) {
    const owned = await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "file") {
        return false;
      }
      if (row.deleted) {
        return true;
      }
      if (tx.mailbox) {
        tx.mailbox = {
          ...tx.mailbox,
          usedBytes: Math.max(0, tx.mailbox.usedBytes - row.size),
        };
      }
      await tx.put({ ...row, deleted: true });
      return true;
    });
    if (owned) {
      await this.transport.remove(id);
    }
  }
  async remove(userId: UserId, id: EmailId) {
    const files = await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "message" || row.deleted) {
        return [];
      }
      if (tx.mailbox) {
        tx.mailbox = {
          ...tx.mailbox,
          usedBytes: Math.max(0, tx.mailbox.usedBytes - recordBytes(row.text)),
        };
      }
      await tx.put({
        ...row,
        deleted: true,
        text: "",
        subject: "Deleted message",
      });
      return row.files;
    });
    await Effect.runPromise(
      Effect.forEach(
        files,
        (idToDelete) =>
          Effect.promise(async () => {
            await this.removeFile(userId, idToDelete);
          }),
        { concurrency: 1 }
      )
    );
  }
  async move(userId: UserId, id: EmailId, conversationId: ConversationId) {
    await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "message" || row.deleted) {
        throw new Error("Message unavailable.");
      }
      await tx.put({ ...row, conversationId });
    });
  }
  async wait(
    userId: UserId,
    conversationId: ConversationId,
    runId: RunId,
    expectedDomain: string
  ): Promise<EmailWait> {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(expectedDomain)) {
      throw new Error("Provide the expected service domain.");
    }
    return await this.store.transaction(userId, async (tx) => {
      const box = requireMailbox(tx);
      const resolvedEmail9 = await tx.list("wait");
      const existing = resolvedEmail9.find(
        (row) =>
          row.kind === "wait" &&
          row.runId === runId &&
          row.expectedDomain === expectedDomain &&
          row.status === "waiting"
      );
      if (existing?.kind === "wait") {
        return existing;
      }
      const id = EmailWaitId.generate();
      const wait: EmailWait = {
        kind: "wait",
        id,
        conversationId,
        runId,
        alias: `${box.handle}+${id}`,
        expectedDomain,
        createdAt: this.now(),
        expiresAt: this.now() + 7 * 86_400_000,
        status: "waiting",
        emailId: null,
      };
      await tx.put(wait);
      return wait;
    });
  }
  async cancelWaits(userId: UserId, runId: RunId) {
    await this.store.transaction(userId, async (tx) => {
      await Effect.runPromise(
        Effect.forEach(
          await tx.list("wait"),
          (row) =>
            Effect.promise(async () => {
              if (
                row.kind === "wait" &&
                row.runId === runId &&
                row.status === "waiting"
              ) {
                await tx.put({ ...row, status: "cancelled" });
              }
            }),
          { concurrency: 1 }
        )
      );
    });
  }
  async waitStatus(userId: UserId, id: EmailWaitId): Promise<EmailWait> {
    return await this.store.transaction(userId, async (tx) => {
      const row = await tx.get(id);
      if (row?.kind !== "wait") {
        throw new Error("Wait unavailable.");
      }
      return row;
    });
  }
  async removeConversation(userId: UserId, conversationId?: ConversationId) {
    await this.store.transaction(userId, async (tx) => {
      const fileIds = new Set<EmailFileId>();
      await Effect.runPromise(
        Effect.forEach(
          ["message", "draft", "wait"] as const,
          (kind) =>
            Effect.promise(async () => {
              await Effect.runPromise(
                Effect.forEach(
                  await tx.list(kind),
                  (row) =>
                    Effect.promise(async () => {
                      if (
                        row.kind === "file" ||
                        (conversationId &&
                          row.conversationId !== conversationId)
                      ) {
                        return;
                      }
                      if (row.kind === "wait") {
                        await tx.put({ ...row, status: "cancelled" });
                        return;
                      }
                      for (const id of row.files) {
                        fileIds.add(id);
                      }
                      if (tx.mailbox) {
                        tx.mailbox = {
                          ...tx.mailbox,
                          usedBytes: Math.max(
                            0,
                            tx.mailbox.usedBytes - recordBytes(row.text)
                          ),
                        };
                      }
                      await tx.put(
                        row.kind === "message"
                          ? {
                              ...row,
                              deleted: true,
                              text: "",
                              subject: "Deleted message",
                            }
                          : {
                              ...row,
                              deleted: true,
                              status:
                                row.status === "draft"
                                  ? "discarded"
                                  : row.status,
                              text: "",
                              subject: "Deleted message",
                              error: null,
                            }
                      );
                    }),
                  { concurrency: 1 }
                )
              );
            }),
          { concurrency: 1 }
        )
      );
      await Effect.runPromise(
        Effect.forEach(
          await tx.list("file"),
          (row) =>
            Effect.promise(async () => {
              if (
                row.kind === "file" &&
                !row.deleted &&
                (!conversationId || fileIds.has(row.id))
              ) {
                await tx.put({ ...row, deleted: true });
                if (tx.mailbox) {
                  tx.mailbox = {
                    ...tx.mailbox,
                    usedBytes: Math.max(0, tx.mailbox.usedBytes - row.size),
                  };
                }
              }
            }),
          { concurrency: 1 }
        )
      );
      if (!conversationId && tx.mailbox) {
        tx.mailbox = { ...tx.mailbox, active: false };
      }
    });
  }
  async cleanup(userId: UserId) {
    const files = await this.store.transaction(userId, async (tx) => {
      const deletedMessages = await tx.list("message");
      const ids = new Set(
        deletedMessages.flatMap((row) =>
          row.kind === "message" && row.deleted ? row.files : []
        )
      );
      const storedFiles = await tx.list("file");
      return storedFiles.filter(
        (row): row is EmailFile =>
          row.kind === "file" && (row.deleted || ids.has(row.id))
      );
    });
    await Effect.runPromise(
      Effect.forEach(
        files,
        (file) =>
          Effect.promise(async () => {
            await this.removeFile(userId, file.id);
          }),
        { concurrency: 1 }
      )
    );
  }
  async maintain() {
    await Effect.runPromise(
      Effect.forEach(
        await this.store.owners(),
        (owner) =>
          Effect.promise(async () => {
            await this.cleanup(owner);
            const drafts = await this.store.transaction(
              owner,
              async (tx) => await tx.list("draft")
            );
            await Effect.runPromise(
              Effect.forEach(
                drafts,
                (row) =>
                  Effect.promise(async () => {
                    if (
                      row.kind === "draft" &&
                      !row.deleted &&
                      (row.status === "sending" || row.status === "uncertain")
                    ) {
                      await this.draftStatus(owner, row.id);
                    }
                  }),
                { concurrency: 1 }
              )
            );
          }),
        { concurrency: 1 }
      )
    );
  }
}
