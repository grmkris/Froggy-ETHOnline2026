/**
 * The web chat's half of a turn: the SSE response.
 *
 * The loop itself lives in `turn.ts`, shared with Telegram. What this adds is
 * the response the AI SDK's transport reads, tee'd into the run so a
 * reconnecting client can be handed the part of the turn it missed.
 */

import { createUIMessageStreamResponse } from "ai";

import { recordTurn, startTurn, uiStreamOf } from "./turn";
import type { TurnDeps, TurnInput } from "./turn";

export type ChatRequest = TurnInput;
export type ChatDeps = TurnDeps;

export const handleChat = async (
  deps: ChatDeps,
  request: ChatRequest
): Promise<Response> => {
  const turn = await startTurn(deps, request);
  return createUIMessageStreamResponse({
    // The recorder is what keeps the loop alive across a detach, and what
    // makes `GET /api/chat/:id/stream` able to hand a reconnecting client
    // the part of the turn it missed.
    consumeSseStream: ({ stream }) => {
      recordTurn(deps, request.sessionId, turn.run, stream);
    },
    stream: uiStreamOf(turn),
  });
};
