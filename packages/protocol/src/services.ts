import { RunId, SaleId, TaskId, TaskStatus, UsdMicros } from "@froggy/domain";
import { Schema } from "effect";

export const ServiceName = Schema.Literals([
  "x_search",
  "web_search",
  "image",
  "inference",
  "speech",
]);
export type ServiceName = typeof ServiceName.Type;
export const ServiceRequest = Schema.Struct({
  v: Schema.Literals([1]),
  service: ServiceName,
  prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  idempotencyKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128)
  ),
});
export type ServiceRequest = typeof ServiceRequest.Type;
export const ServiceCard = Schema.Struct({
  name: ServiceName,
  title: Schema.String,
  description: Schema.String,
  provider: Schema.String,
  priceUsdMicros: UsdMicros,
  maxInput: Schema.Int,
  status: Schema.Literals(["demo", "configured", "unavailable"]),
  note: Schema.String,
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
});
export type ServiceResult = typeof ServiceResult.Type;
export const ServiceTicket = Schema.Struct({
  v: Schema.Literals([1]),
  id: TaskId,
  runId: Schema.NullOr(RunId),
  saleId: Schema.NullOr(SaleId),
  upstreamTransactionId: Schema.NullOr(Schema.String),
  status: TaskStatus,
  service: ServiceName,
  prompt: Schema.String,
  priceUsdMicros: UsdMicros,
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
  saleId: Schema.NullOr(SaleId),
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
