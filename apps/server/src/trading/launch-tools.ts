import { LaunchWatchId } from "@froggy/domain";
import type { LaunchWatch } from "@froggy/domain";
import { Schema } from "effect";

export const LaunchStatusInput = Schema.Struct({ watchId: LaunchWatchId });
export const launchToolResult = (watch: LaunchWatch) => ({
  v: 1,
  id: watch.id,
  sourceTaskId: watch.sourceTaskId,
  input: watch.input,
  status: watch.status,
  expiresAt: watch.expiresAt,
  pollsUsed: watch.pollsUsed,
  maxPolls: watch.maxPolls,
  eventCount: watch.events.length,
  events: watch.events.slice(-10),
  gapCount: watch.gapCount,
  lastGap: watch.lastGap,
  error: watch.error,
  stubbed: watch.stubbed,
});
