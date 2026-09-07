/**
 * A refused turn comes back as the request's error, not as a message.
 *
 * The server answers with `{ error }` and the transport hands that body back
 * as the error's message. Read the sentence out of it when it is there; the
 * raw message otherwise.
 */

import { Schema } from "effect";

export const CHAT_ERROR_ID = "chat:error";

const ErrorBody = Schema.Struct({ error: Schema.String });
const decodeErrorBody = Schema.decodeUnknownResult(ErrorBody);

export const chatErrorText = (message: string): string => {
  try {
    const decoded = decodeErrorBody(JSON.parse(message));
    return decoded._tag === "Success" ? decoded.success.error : message;
  } catch {
    return message;
  }
};
