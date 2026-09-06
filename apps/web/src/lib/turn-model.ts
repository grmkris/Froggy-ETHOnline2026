/**
 * Which receipt belongs to which tool call.
 *
 * A receipt names the call that spent, and that is the join. Receipts from
 * before the name existed have none, so they fall back to order: the first
 * unnamed receipt under a turn belongs to the first money call without one.
 * Anything left over is filed under the turn as before, never dropped.
 */

import type { Receipt } from "@froggy/domain";
import { Schema } from "effect";

import type { FroggyMessage } from "./stream-model";
import { MONEY_TOOLS } from "./tool-stories";

export interface ClaimedReceipts {
  /** By tool call id. */
  readonly byCall: ReadonlyMap<string, Receipt>;
  /** Receipts no card claimed, in time order. */
  readonly unclaimed: readonly Receipt[];
}

/** Only the id matters here; the rest of the part is the card's business. */
const decodeId = Schema.decodeUnknownResult(
  Schema.Struct({ toolCallId: Schema.String })
);

const toolCallIdOf = (part: FroggyMessage["parts"][number]): string | null => {
  const decoded = decodeId(part);
  return decoded._tag === "Success" ? decoded.success.toolCallId : null;
};

/** The money calls of a message, in order, as their ids. */
const moneyCallIds = (message: FroggyMessage): readonly string[] =>
  message.parts.flatMap((part) => {
    const id = toolCallIdOf(part);
    return id !== null && MONEY_TOOLS.has(part.type.replace(/^tool-/u, ""))
      ? [id]
      : [];
  });

export const matchReceipts = (
  message: FroggyMessage,
  receipts: readonly Receipt[]
): ClaimedReceipts => {
  const ordered = receipts.toSorted((a, b) => a.at - b.at);
  const byCall = new Map<string, Receipt>();
  const unnamed: Receipt[] = [];
  const callIds = new Set(
    message.parts.flatMap((part) => {
      const id = toolCallIdOf(part);
      return id === null ? [] : [id];
    })
  );
  for (const receipt of ordered) {
    if (receipt.toolCallId !== undefined && callIds.has(receipt.toolCallId)) {
      byCall.set(receipt.toolCallId, receipt);
    } else if (receipt.toolCallId === undefined) {
      unnamed.push(receipt);
    }
  }
  // Older receipts: first come, first claimed, by the money calls still bare.
  const bare = moneyCallIds(message).filter((id) => !byCall.has(id));
  const claimedByOrder = unnamed.slice(0, bare.length);
  for (const [index, receipt] of claimedByOrder.entries()) {
    const id = bare[index];
    if (id !== undefined) {
      byCall.set(id, receipt);
    }
  }
  const claimed = new Set([...byCall.values()].map((receipt) => receipt.id));
  return {
    byCall,
    unclaimed: ordered.filter((receipt) => !claimed.has(receipt.id)),
  };
};
