/**
 * The web chat's half of a turn: the SSE response.
 *
 * The loop itself lives in `turn.ts`, shared with Telegram. What this adds is
 * the response the AI SDK's transport reads, tee'd into the run so a
 * reconnecting client can be handed the part of the turn it missed.
 */

import { createUIMessageStreamResponse } from "ai";

import { HistoryDuplicateError } from "./history";
import { recordTurn, startTurn, uiStreamOf } from "./turn";
import type { TurnDeps, TurnInput } from "./turn";

export type ChatRequest = TurnInput;
export type ChatDeps = TurnDeps;

export const handleChat = async (
  deps: ChatDeps,
  request: ChatRequest
): Promise<Response> => {
  let turn: Awaited<ReturnType<typeof startTurn>>;
  try {
    turn = await startTurn(deps, request);
  } catch (error) {
    if (!(error instanceof HistoryDuplicateError)) {
      throw error;
    }
    const active = deps.runs.get(request.sessionId);
    const replay = active?.id === error.run.id ? active.replay() : null;
    return replay === null
      ? Response.json(
          {
            v: 1,
            accepted: true,
            runId: error.run.id,
            conversationId: error.run.conversationId,
          },
          { status: 409 }
        )
      : new Response(replay.pipeThrough(new TextEncoderStream()), {
          headers: { "content-type": "text/event-stream" },
        });
  }
  return createUIMessageStreamResponse({
    headers: {
      "x-conversation-id": turn.history.conversationId,
      "x-run-id": turn.run.id,
    },
    // The recorder is what keeps the loop alive across a detach, and what
    // makes `GET /api/chat/:id/stream` able to hand a reconnecting client
    // the part of the turn it missed.
    consumeSseStream: ({ stream }) => {
      recordTurn(deps, request.sessionId, turn.run, stream);
    },
    stream: uiStreamOf(turn),
  });
};
