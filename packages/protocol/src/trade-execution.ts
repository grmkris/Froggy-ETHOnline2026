import {
  ApprovalId,
  Trade,
  TradeInput,
  TradeRuleId,
  TradeRule,
  TradeStep,
  TradeStepId,
} from "@froggy/domain";
import { Schema } from "effect";

/** Signed bytes are recovery material and must never leave the server. */
const PublicTradeStep = TradeStep.mapFields(
  ({ signedPayload: _signedPayload, managed: _managed, ...fields }) => fields
);
export const TradeTicket = Trade.mapFields(({ steps: _steps, ...fields }) => ({
  ...fields,
  steps: Schema.Array(PublicTradeStep).check(Schema.isMaxLength(8)),
}));
export type TradeTicket = typeof TradeTicket.Type;

export const TradePrepare = Schema.Struct({
  v: Schema.Literal(1),
  input: TradeInput,
  idempotencyKey: Trade.fields.idempotencyKey,
  sourceTradeId: Trade.fields.sourceTradeId,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradePrepare = typeof TradePrepare.Type;
export const TradeAnswer = Schema.Struct({
  v: Schema.Literal(1),
  stepId: TradeStepId,
  approvalId: ApprovalId,
  fingerprint: TradeStep.fields.fingerprint,
  authorizationSignature: Schema.optionalKey(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096))
  ),
  decision: Schema.Literals(["allow_once", "deny", "deny_stop"]),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradeAnswer = typeof TradeAnswer.Type;
export const TradeList = Schema.Struct({
  v: Schema.Literal(1),
  trades: Schema.Array(TradeTicket).check(Schema.isMaxLength(50)),
});
export const TradeRuleRequest = TradeRule.mapFields(
  ({ id: _id, createdAt: _createdAt, revokedAt: _revokedAt, ...fields }) =>
    fields
);
export type TradeRuleRequest = typeof TradeRuleRequest.Type;
export const TradeStopRequest = Schema.Struct({
  v: Schema.Literal(1),
  stopped: Schema.Boolean,
});

export const publicTrade = (trade: Trade): TradeTicket => ({
  ...trade,
  steps: trade.steps.map(
    ({ signedPayload: _signedPayload, managed: _managed, ...step }) => step
  ),
});

export const TradeCapabilities = Schema.Struct({
  v: Schema.Literal(1),
  routes: Schema.Array(
    Schema.Struct({
      venue: TradeInput.fields.venue,
      action: TradeInput.fields.action,
      network: TradeInput.fields.network,
      mode: Schema.Literals(["live", "stub", "unavailable"]),
      wallet: Schema.NullOr(Schema.String),
      feePayer: Schema.optionalKey(Schema.Literals(["app", "wallet_native"])),
      execution: Schema.optionalKey(Schema.Literals(["privy_batch", "raw"])),
      launchFactory: Schema.optionalKey(TradeRule.fields.launchFactory),
      quoteAsset: Schema.optionalKey(TradeRule.fields.inputAsset),
      limitations: Schema.Array(
        Schema.String.check(Schema.isMaxLength(500))
      ).check(Schema.isMaxLength(8)),
    })
  ).check(Schema.isMaxLength(32)),
});

export const TradeExecute = Schema.Struct({
  v: Schema.Literal(1),
  ruleId: TradeRuleId,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type TradeExecute = typeof TradeExecute.Type;

export const TradeRuleList = Schema.Struct({
  v: Schema.Literal(1),
  rules: Schema.Array(TradeRule).check(Schema.isMaxLength(100)),
});

export const TradeAuthorization = Schema.Struct({
  v: Schema.Literal(1),
  request: Schema.NullOr(
    Schema.Struct({
      version: Schema.Literal(1),
      method: Schema.Literal("POST"),
      url: Schema.String.check(Schema.isMaxLength(300)),
      headers: Schema.Record(Schema.String, Schema.String),
      body: Schema.Json,
    })
  ),
});
