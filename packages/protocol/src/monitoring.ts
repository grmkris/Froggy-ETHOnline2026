import {
  Monitor,
  MonitorCheck,
  MonitorConfig,
  MonitorId,
  MonitoringBook,
  MonitorObservation,
} from "@froggy/domain";
import { Schema } from "effect";

export const MonitoringBudgetRequest = Schema.Struct({
  v: Schema.Literal(1),
  ...MonitoringBook.fields.budget.fields,
});
export const MonitorRequest = Schema.Struct({
  v: Schema.Literal(1),
  ...MonitorConfig.fields,
});
export const MonitorAction = Schema.Struct({
  v: Schema.Literal(1),
  id: MonitorId,
  action: Schema.Literals(["pause", "resume", "check"]),
});
export const MonitoringState = Schema.Struct({
  v: Schema.Literal(1),
  budget: MonitoringBook.fields.budget,
  months: MonitoringBook.fields.months,
  monitors: Schema.Array(Monitor),
  checks: Schema.Array(MonitorCheck),
});
export const TaskOutcome = Schema.Struct({
  status: Schema.Literals(["completed", "blocked", "incomplete"]),
  reason: Schema.String.check(Schema.isMaxLength(1500)),
  evidence: Schema.String.check(Schema.isMaxLength(3000)),
  observation: Schema.optional(MonitorObservation),
});
export type TaskOutcome = typeof TaskOutcome.Type;
