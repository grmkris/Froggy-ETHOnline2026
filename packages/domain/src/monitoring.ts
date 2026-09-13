import { Schema } from "effect";

import { AgentConnectionId } from "./agent-invocation";
import { MonitorCheckId, MonitorId, TaskId, WatchlistItemId } from "./id";
import { publicHttpUrl } from "./url";

const text = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1000)
);
const money = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 1_000_000_000 })
);
export const MonitorCondition = Schema.Union([
  Schema.TaggedStruct("price_below", {
    amount: Schema.Finite.check(Schema.isGreaterThan(0)),
    currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  Schema.TaggedStruct("price_drop", {
    percent: Schema.Finite.check(
      Schema.isBetween({ minimum: 0.1, maximum: 100 })
    ),
    currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  }),
  Schema.TaggedStruct("availability", { value: text }),
  Schema.TaggedStruct("change", { field: text }),
]);
export const MonitorConfig = Schema.Struct({
  itemId: WatchlistItemId,
  cadence: Schema.Literals(["hourly", "daily", "weekly"]),
  timezone: Schema.String,
  condition: MonitorCondition,
  context: text,
});
export type MonitorConfig = typeof MonitorConfig.Type;
export const MonitorObservation = Schema.Struct({
  at: Schema.Int,
  value: text,
  price: Schema.NullOr(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  currency: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u))),
  sourceUrl: Schema.String.check(
    Schema.isMaxLength(2048),
    Schema.makeFilter((value) => publicHttpUrl(value).ok, {
      message: "Observation source must be a public URL.",
    })
  ),
  evidence: text,
  stubbed: Schema.Boolean,
});
export type MonitorObservation = typeof MonitorObservation.Type;
export const Monitor = Schema.Struct({
  v: Schema.Literal(1),
  id: MonitorId,
  ...MonitorConfig.fields,
  connectionId: Schema.NullOr(AgentConnectionId),
  revision: Schema.Int,
  status: Schema.Literals([
    "scheduled",
    "checking",
    "needs_help",
    "budget_exhausted",
    "failed",
    "paused",
  ]),
  nextAt: Schema.Int,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  baseline: Schema.NullOr(MonitorObservation),
  latest: Schema.NullOr(MonitorObservation),
  matched: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  checkId: Schema.NullOr(MonitorCheckId),
});
export type Monitor = typeof Monitor.Type;
export const MonitorCheck = Schema.Struct({
  v: Schema.Literal(1),
  id: MonitorCheckId,
  monitorId: MonitorId,
  revision: Schema.Int,
  createdAt: Schema.Int,
  updatedAt: Schema.Int,
  month: Schema.String,
  reservedUsdMicros: money,
  spentUsdMicros: money,
  status: Schema.Literals([
    "reserved",
    "running",
    "needs_help",
    "done",
    "failed",
    "uncertain",
  ]),
  taskId: Schema.NullOr(TaskId),
  observation: Schema.NullOr(MonitorObservation),
  error: Schema.NullOr(Schema.String),
  alert: Schema.NullOr(Schema.String),
  notifiedAt: Schema.NullOr(Schema.Int),
});
export type MonitorCheck = typeof MonitorCheck.Type;
export const MonitoringBook = Schema.Struct({
  v: Schema.Literal(1),
  budget: Schema.Struct({ monthlyUsdMicros: money, timezone: Schema.String }),
  budgetNoticeMonth: Schema.optionalKey(Schema.String),
  months: Schema.Array(
    Schema.Struct({ month: Schema.String, spentUsdMicros: money })
  ),
  monitors: Schema.Array(Monitor).check(Schema.isMaxLength(200)),
  checks: Schema.Array(MonitorCheck).check(Schema.isMaxLength(1000)),
});
export type MonitoringBook = typeof MonitoringBook.Type;
export const emptyMonitoringBook = (): MonitoringBook => ({
  v: 1,
  budget: { monthlyUsdMicros: 0, timezone: "UTC" },
  months: [],
  monitors: [],
  checks: [],
});

/** Failed/mismatched observations never become a comparison or an alert. */
export const monitorMatches = (
  monitor: Monitor,
  current: MonitorObservation
): boolean => {
  const { condition, baseline, latest } = monitor;
  if (!baseline) {
    return false;
  }
  if (condition._tag === "availability") {
    return current.value.toLowerCase() === condition.value.toLowerCase();
  }
  if (condition._tag === "change") {
    return current.value !== (latest ?? baseline).value;
  }
  if (current.currency !== condition.currency || current.price === null) {
    return false;
  }
  if (condition._tag === "price_below") {
    return current.price <= condition.amount;
  }
  return (
    baseline.currency === condition.currency &&
    baseline.price !== null &&
    current.price <= baseline.price * (1 - condition.percent / 100)
  );
};
