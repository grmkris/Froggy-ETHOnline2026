/**
 * A Telegram account bound to a person. The bot's DM thread with them is
 * kept so it can be written to first — a digest, an approval card — rather
 * than only in reply.
 */

import { Schema } from "effect";

export const TelegramPairing = Schema.Struct({
  since: Schema.Int,
  telegramUserId: Schema.String,
  threadId: Schema.String,
});
export type TelegramPairing = typeof TelegramPairing.Type;
