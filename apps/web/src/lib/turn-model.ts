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
import { isToolPart, toolCallOf, richResultOf } from "./tool-call";
import type { ToolCall } from "./tool-call";
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

/**
 * The parts of a turn, grouped the way a person reads them.
 *
 * Text, thought, and tool calls stay one block each, except the page steps:
 * a run of browser calls is one story — "browsed the oracle, four steps" —
 * and the step boundaries the SDK puts between them are not breaks in it.
 * A step boundary between two other blocks stays, as a hairline.
 */
export type TurnBlock =
  | {
      readonly kind: "service";
      readonly calls: readonly ToolCall[];
      readonly index: number;
    }
  | {
      readonly kind: "browse";
      readonly calls: readonly ToolCall[];
      readonly index: number;
    }
  | {
      readonly kind: "reasoning";
      readonly index: number;
      readonly live: boolean;
      readonly text: string;
    }
  | { readonly kind: "step"; readonly index: number }
  | {
      readonly kind: "text";
      readonly index: number;
      readonly live: boolean;
      readonly text: string;
    }
  | { readonly kind: "tool"; readonly call: ToolCall; readonly index: number }
  | { readonly kind: "unknown"; readonly index: number; readonly type: string };

type Part = FroggyMessage["parts"][number];

const isBrowserPart = (part: Part): boolean =>
  part.type.startsWith("tool-browser_");

/** Is the next thing that is not a step boundary another page step? */
const nextIsBrowser = (parts: readonly Part[], from: number): boolean => {
  for (let index = from + 1; index < parts.length; index += 1) {
    const part = parts[index];
    if (part !== undefined && part.type !== "step-start") {
      return isBrowserPart(part);
    }
  }
  return false;
};

/** One block for a part that is not a page step; null for a step boundary. */
const blockOf = (part: Part, index: number): TurnBlock | null => {
  if (part.type === "text") {
    return {
      index,
      kind: "text",
      live: part.state === "streaming",
      text: part.text,
    };
  }
  if (part.type === "reasoning") {
    return part.text.trim() === ""
      ? null
      : {
          index,
          kind: "reasoning",
          live: part.state === "streaming",
          text: part.text,
        };
  }
  if (isToolPart(part)) {
    const call = toolCallOf(part);
    return call === null
      ? { index, kind: "unknown", type: part.type }
      : { call, index, kind: "tool" };
  }
  return null;
};

export const groupParts = (message: FroggyMessage): readonly TurnBlock[] => {
  const { parts } = message;
  const blocks: TurnBlock[] = [];
  let browse: { calls: ToolCall[]; index: number } | null = null;
  const flush = (): void => {
    if (browse !== null) {
      blocks.push({ calls: browse.calls, index: browse.index, kind: "browse" });
      browse = null;
    }
  };
  for (const [index, part] of parts.entries()) {
    if (part.type === "step-start") {
      if (browse !== null && nextIsBrowser(parts, index)) {
        continue;
      }
      flush();
      if (index > 0 && index < parts.length - 1) {
        blocks.push({ index, kind: "step" });
      }
      continue;
    }
    const call = isBrowserPart(part) ? toolCallOf(part) : null;
    if (call !== null) {
      if (browse === null) {
        browse = { calls: [call], index };
      } else {
        browse.calls.push(call);
      }
      continue;
    }
    flush();
    const block = blockOf(part, index);
    if (block !== null) {
      blocks.push(block);
    }
  }
  flush();
  const grouped: TurnBlock[] = [];
  const tasks = new Map<
    string,
    {
      readonly kind: "service";
      readonly calls: ToolCall[];
      readonly index: number;
    }
  >();
  for (const block of blocks) {
    const result = block.kind === "tool" ? richResultOf(block.call) : null;
    if (block.kind !== "tool" || !result || !("service" in result)) {
      grouped.push(block);
      continue;
    }
    const previous = tasks.get(result.id);
    if (previous) {
      previous.calls.push(block.call);
    } else {
      const group = {
        kind: "service" as const,
        calls: [block.call],
        index: block.index,
      };
      tasks.set(result.id, group);
      grouped.push(group);
    }
  }
  return grouped;
};

export interface TurnCost {
  /** Payments that settled. */
  readonly payments: number;
  /** Refused by the mandate, or allowed and not paid. */
  readonly refusals: number;
  /** What the settled payments came to, in USD millionths. */
  readonly usdMicros: number;
}

/** The turn's money in three numbers; null when nothing was even attempted. */
export const turnCost = (receipts: readonly Receipt[]): TurnCost | null => {
  if (receipts.length === 0) {
    return null;
  }
  const settled = receipts.filter(
    (receipt) => receipt.settlement !== undefined
  );
  return {
    payments: settled.length,
    refusals: receipts.filter(
      (receipt) =>
        receipt.decision._tag === "deny" || receipt.failure !== undefined
    ).length,
    usdMicros: settled.reduce(
      (sum, receipt) => sum + receipt.intent.usdMicros,
      0
    ),
  };
};
