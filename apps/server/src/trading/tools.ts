import { TradeId, TradeRuleId } from "@froggy/domain";
import { TradePrepare } from "@froggy/protocol";
import type { TradeTicket } from "@froggy/protocol";
import { Schema, Struct } from "effect";

export const TradeToolInput = TradePrepare.mapFields(Struct.omit(["v"]));
export const TradeStatusInput = Schema.Struct({ tradeId: TradeId });

/** Explicit bounded summary; transaction calldata and recovery bytes are never tool output. */
export const tradeToolResult = (trade: TradeTicket) => ({
  v: 1,
  id: trade.id,
  sourceTradeId: trade.sourceTradeId ?? null,
  status: trade.status,
  input: trade.input,
  expectedOutput: trade.expectedOutput,
  minimumOutput: trade.minimumOutput,
  actualOutput: trade.actualOutput,
  actualInput: trade.actualInput ?? null,
  phase: trade.phase,
  stubbed: trade.stubbed,
  error: trade.error,
  receiptId: trade.receiptId,
  reservationState: trade.reservationState,
  steps: trade.steps.map((step) => ({
    id: step.id,
    kind: step.kind,
    status: step.status,
    description: step.description,
    expiresAt: step.expiresAt,
    simulation: step.simulation.status,
    transactionId: step.transactionId,
    actualNativeFee: step.actualNativeFee,
  })),
  events: trade.events.slice(-5),
  approvalRequired: trade.status === "awaiting_approval",
});

export const TradeExecuteInput = Schema.Struct({
  tradeId: TradeId,
  ruleId: TradeRuleId,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
