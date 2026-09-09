import { LaunchWatch, LaunchWatchInput } from "@froggy/domain";
import { Schema, Struct } from "effect";

/** Public watch state excludes internal leases, connection identity and deduplication keys. */
export const LaunchWatchTicket = LaunchWatch.mapFields(
  Struct.omit([
    "connectionId",
    "revision",
    "claimExpiresAt",
    "seen",
    "providerStubbed",
  ])
);
export type LaunchWatchTicket = typeof LaunchWatchTicket.Type;

export const LaunchWatchResult = Schema.Struct({
  v: Schema.Literal(1),
  operation: Schema.Literal("watch_launches"),
  network: LaunchWatchInput.fields.network,
  watch: LaunchWatchTicket,
  stubbed: Schema.Boolean,
  limitations: Schema.Array(Schema.String.check(Schema.isMaxLength(500))).check(
    Schema.isMaxLength(10)
  ),
});
export type LaunchWatchResult = typeof LaunchWatchResult.Type;
