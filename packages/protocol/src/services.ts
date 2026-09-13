import {
  CreditChargeId,
  CreditChargeStatus,
  CreditUnits,
  RunId,
  SaleId,
  TaskId,
  TaskStatus,
  UsdMicros,
} from "@froggy/domain";
import { Schema } from "effect";

import { TradingNetwork } from "./trading";
import {
  TradingResult,
  TradingServiceName,
  TradingServiceRequest,
} from "./trading-services";

export const CreditBillingError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  fundingUrl: Schema.String,
});
export type CreditBillingError = typeof CreditBillingError.Type;

export const PromptServiceName = Schema.Literals([
  "x_search",
  "web_search",
  "image",
  "inference",
  "speech",
]);
export type PromptServiceName = typeof PromptServiceName.Type;
export const ServiceName = Schema.Union([
  PromptServiceName,
  TradingServiceName,
]);
export type ServiceName = typeof ServiceName.Type;
export const PromptServiceRequest = Schema.Struct({
  v: Schema.Literals([2]),
  service: PromptServiceName,
  prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
});
export type PromptServiceRequest = typeof PromptServiceRequest.Type;
export const ServiceRequest = Schema.Union([
  PromptServiceRequest,
  TradingServiceRequest,
]);
export type ServiceRequest = typeof ServiceRequest.Type;
export const ServiceCard = Schema.Struct({
  name: ServiceName,
  title: Schema.String,
  description: Schema.String,
  provider: Schema.String,
  priceUsdMicros: UsdMicros,
  priceCreditUnits: Schema.optional(CreditUnits),
  maxInput: Schema.Int,
  status: Schema.Literals(["demo", "configured", "unavailable"]),
  note: Schema.String,
  inputKind: Schema.optional(Schema.Literals(["prompt", "structured"])),
  networks: Schema.optional(Schema.Array(TradingNetwork)),
  inputSchema: Schema.optional(Schema.Json),
});
export type ServiceCard = typeof ServiceCard.Type;
export const ServiceCatalog = Schema.Struct({
  v: Schema.Literals([1]),
  services: Schema.Array(ServiceCard),
});
const ServiceSource = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  text: Schema.String,
});
export const ServiceResult = Schema.Struct({
  v: Schema.Literals([1]),
  service: ServiceName,
  stubbed: Schema.Boolean,
  text: Schema.String,
  sources: Schema.Array(ServiceSource),
  artifact: Schema.NullOr(
    Schema.Struct({
      mime: Schema.Literals([
        "image/png",
        "image/jpeg",
        "image/webp",
        "audio/mpeg",
      ]),
      base64: Schema.String,
    })
  ),
  upstreamTransactionId: Schema.NullOr(Schema.String),
  data: Schema.optional(TradingResult),
});
export type ServiceResult = typeof ServiceResult.Type;
export const ServiceTicket = Schema.Struct({
  v: Schema.Literals([1]),
  id: TaskId,
  runId: Schema.NullOr(RunId),
  saleId: Schema.NullOr(SaleId),
  billingError: Schema.optional(CreditBillingError),
  chargeId: Schema.optional(CreditChargeId),
  chargeStatus: Schema.optional(CreditChargeStatus),
  upstreamTransactionId: Schema.NullOr(Schema.String),
  status: TaskStatus,
  service: ServiceName,
  prompt: Schema.String,
  data: Schema.optional(TradingResult),
  priceUsdMicros: UsdMicros,
  priceCreditUnits: Schema.optional(CreditUnits),
  error: Schema.NullOr(Schema.String),
  text: Schema.String,
  sources: Schema.Array(ServiceSource),
  stubbed: Schema.Boolean,
  artifact: Schema.NullOr(
    Schema.Struct({ mime: Schema.String, url: Schema.String })
  ),
});
export type ServiceTicket = typeof ServiceTicket.Type;

const taskDetailFields = {
  id: TaskId,
  status: TaskStatus,
  priceUsdMicros: UsdMicros,
  priceCreditUnits: Schema.optional(CreditUnits),
  saleId: Schema.NullOr(SaleId),
  billingError: Schema.optional(CreditBillingError),
  chargeId: Schema.optional(CreditChargeId),
  chargeStatus: Schema.optional(CreditChargeStatus),
  error: Schema.NullOr(Schema.String),
};

/** The task selected from an agent's history, including CLI briefs and browses. */
export const TaskDetail = Schema.Struct({
  v: Schema.Literals([1]),
  task: Schema.Union([
    Schema.Struct({
      ...taskDetailFields,
      kind: Schema.Literals(["service"]),
      result: ServiceTicket,
    }),
    Schema.Struct({
      ...taskDetailFields,
      kind: Schema.Literals(["brief"]),
      result: Schema.NullOr(
        Schema.Struct({
          cheapestBorrow: Schema.String,
          bestSupply: Schema.String,
          stubbed: Schema.Boolean,
        })
      ),
    }),
    Schema.Struct({
      ...taskDetailFields,
      kind: Schema.Literals(["browse"]),
      result: Schema.NullOr(Schema.Struct({ text: Schema.String })),
    }),
  ]),
});
export type TaskDetail = typeof TaskDetail.Type;
