import {
  ConversationId,
  EmailAddress,
  EmailDraft,
  EmailDraftInput,
  EmailFile,
  EmailHandle,
  EmailMessage,
  EmailWait,
  Mailbox,
} from "@froggy/domain";
import { Schema } from "effect";

export const EmailClaim = Schema.Struct({
  v: Schema.Literal(1),
  handle: EmailHandle,
});
export const EmailDraftRequest = Schema.Struct({
  v: Schema.Literal(1),
  ...EmailDraftInput.fields,
});
export const EmailRevision = Schema.Struct({
  v: Schema.Literal(1),
  revision: Schema.Int,
});
export const EmailStatus = Schema.Struct({
  v: Schema.Literal(1),
  mailbox: Schema.NullOr(Mailbox),
  address: Schema.NullOr(Schema.String),
  domain: Schema.String,
  storageLimit: Schema.Int,
  dailyLimit: Schema.Int,
  unread: Schema.Int,
  stubbed: Schema.Boolean,
});
export const EmailPage = Schema.Struct({
  v: Schema.Literal(1),
  messages: Schema.Array(EmailMessage),
  drafts: Schema.Array(EmailDraft),
  files: Schema.Array(EmailFile),
  waits: Schema.Array(EmailWait),
  cursor: Schema.NullOr(Schema.String),
});
export const EmailInbound = Schema.Struct({
  v: Schema.Literal(1),
  key: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  to: EmailAddress,
  from: EmailAddress,
  size: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 25 * 1024 * 1024 })
  ),
});
export const EmailDelivery = Schema.Struct({
  v: Schema.Literal(1),
  providerId: Schema.String,
  recipient: EmailAddress,
  status: Schema.Literals(["delivered", "bounced"]),
});
export const EmailMove = Schema.Struct({
  v: Schema.Literal(1),
  conversationId: ConversationId,
});
export const EmailWorkerSend = Schema.Struct({
  v: Schema.Literal(1),
  id: EmailDraft.fields.id,
  from: EmailAddress,
  to: EmailDraft.fields.to,
  cc: EmailDraft.fields.cc,
  bcc: EmailDraft.fields.bcc,
  subject: EmailDraft.fields.subject,
  text: EmailDraft.fields.text,
  references: Schema.Array(Schema.String),
  replyAddress: EmailAddress,
  files: Schema.Array(EmailFile),
});
export const EmailSendResult = Schema.Struct({
  v: Schema.Literal(1),
  messageId: Schema.String,
});
