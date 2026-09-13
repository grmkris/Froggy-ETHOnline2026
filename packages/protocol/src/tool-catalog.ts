/**
 * What Froggy can do, priced in credits, for the Tools tab.
 *
 * One entry per tool an agent or the chat can call, grouped by what a person
 * wants done rather than by which scope guards it. A price is fixed credits,
 * a budget the person picks, nothing at all, or the wallet under its rules;
 * usage is what this person has actually run, never a projection.
 */

import { CreditUnits, OAuthScope } from "@froggy/domain";
import { Schema } from "effect";

import { ServiceName } from "./services";

export const ToolPrice = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("credits"), units: CreditUnits }),
  Schema.Struct({
    kind: Schema.Literal("budget"),
    options: Schema.Array(CreditUnits),
  }),
  Schema.Struct({ kind: Schema.Literal("included") }),
  Schema.Struct({ kind: Schema.Literal("wallet") }),
]);
export type ToolPrice = typeof ToolPrice.Type;

export const ToolUsage = Schema.Struct({
  calls: Schema.Int,
  /** Credits captured for this tool; reservations still held do not count. */
  creditUnits: CreditUnits,
  lastAt: Schema.NullOr(Schema.Int),
});
export type ToolUsage = typeof ToolUsage.Type;

export const ToolAvailability = Schema.Literals([
  "ready",
  "simulated",
  "unavailable",
]);
export type ToolAvailability = typeof ToolAvailability.Type;

/** Where a tool may run; `mcp` means a connected agent may call it under its scope. */
export const ToolSurface = Schema.Literals([
  "chat",
  "browse",
  "schedule",
  "monitor",
  "mcp",
]);
export type ToolSurface = typeof ToolSurface.Type;

export const ToolCatalogEntry = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  description: Schema.String,
  price: ToolPrice,
  availability: ToolAvailability,
  scope: Schema.NullOr(OAuthScope),
  surfaces: Schema.Array(ToolSurface),
  /** Set when the entry is also a priced service card the person can run by hand. */
  service: Schema.optional(ServiceName),
  usage: ToolUsage,
});
export type ToolCatalogEntry = typeof ToolCatalogEntry.Type;

export const ToolCatalogGroup = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  tools: Schema.Array(ToolCatalogEntry),
});
export type ToolCatalogGroup = typeof ToolCatalogGroup.Type;

export const ToolCatalog = Schema.Struct({
  v: Schema.Literal(1),
  groups: Schema.Array(ToolCatalogGroup),
});
export type ToolCatalog = typeof ToolCatalog.Type;
