import { Schema } from "effect";

import {
  ConversationId,
  EmailId,
  EmailDraftId,
  EmailFileId,
  EmailWaitId,
  MailboxId,
  RunId,
} from "./id";

export const EmailAddress = Schema.String.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u)
);
export const EmailHandle = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/u)
);
export const Mailbox = Schema.Struct({
  id: MailboxId,
  handle: EmailHandle,
  active: Schema.Boolean,
  conversationId: ConversationId,
  createdAt: Schema.Int,
  usedBytes: Schema.Int,
  stubbed: Schema.Boolean,
});
export type Mailbox = typeof Mailbox.Type;
export const EmailFile = Schema.Struct({
  kind: Schema.Literal("file"),
  id: EmailFileId,
  name: Schema.String,
  mime: Schema.String,
  size: Schema.Int,
  hash: Schema.String,
  createdAt: Schema.Int,
  deleted: Schema.Boolean,
  stubbed: Schema.Boolean,
});
export type EmailFile = typeof EmailFile.Type;
export const EmailMessage = Schema.Struct({
  kind: Schema.Literal("message"),
  id: EmailId,
  conversationId: ConversationId,
  from: EmailAddress,
  to: Schema.Array(EmailAddress),
  cc: Schema.Array(EmailAddress),
  subject: Schema.String,
  text: Schema.String,
  files: Schema.Array(EmailFileId),
  messageId: Schema.String,
  references: Schema.Array(Schema.String),
  deduplicationKey: Schema.String,
  createdAt: Schema.Int,
  read: Schema.Boolean,
  deleted: Schema.Boolean,
  automatic: Schema.Boolean,
  truncated: Schema.Boolean,
  stubbed: Schema.Boolean,
});
export type EmailMessage = typeof EmailMessage.Type;
export const EmailDraftInput = Schema.Struct({
  conversationId: ConversationId,
  to: Schema.Array(EmailAddress).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(10)
  ),
  cc: Schema.Array(EmailAddress).check(Schema.isMaxLength(10)),
  bcc: Schema.Array(EmailAddress).check(Schema.isMaxLength(10)),
  subject: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(998),
    Schema.isPattern(/^[^\r\n]*$/u)
  ),
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100_000)),
  files: Schema.Array(EmailFileId).check(Schema.isMaxLength(10)),
  replyTo: Schema.NullOr(EmailId),
});
export const EmailDraft = Schema.Struct({
  ...EmailDraftInput.fields,
  // Tombstones clear the body; creation still requires nonempty text.
  text: Schema.String.check(Schema.isMaxLength(100_000)),
  kind: Schema.Literal("draft"),
  id: EmailDraftId,
  revision: Schema.Int,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  status: Schema.Literals([
    "draft",
    "sending",
    "accepted",
    "delivered",
    "bounced",
    "uncertain",
    "discarded",
    "failed",
  ]),
  deleted: Schema.Boolean,
  recipientCount: Schema.Int,
  approvedAt: Schema.NullOr(Schema.Int),
  deliveries: Schema.Array(
    Schema.Struct({
      recipient: EmailAddress,
      status: Schema.Literals(["delivered", "bounced"]),
    })
  ),
  providerId: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  fileHashes: Schema.Array(Schema.String),
  stubbed: Schema.Boolean,
});
export type EmailDraft = typeof EmailDraft.Type;
export const EmailWait = Schema.Struct({
  kind: Schema.Literal("wait"),
  id: EmailWaitId,
  conversationId: ConversationId,
  runId: RunId,
  alias: Schema.String,
  expectedDomain: Schema.String,
  createdAt: Schema.Int,
  expiresAt: Schema.Int,
  status: Schema.Literals(["waiting", "received", "cancelled"]),
  emailId: Schema.NullOr(EmailId),
});
export type EmailWait = typeof EmailWait.Type;
export const EmailRecord = Schema.Union([
  EmailMessage,
  EmailDraft,
  EmailFile,
  EmailWait,
]);
export type EmailRecord = typeof EmailRecord.Type;
