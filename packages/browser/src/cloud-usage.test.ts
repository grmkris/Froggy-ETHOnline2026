import { expect, test } from "bun:test";

import { recordCloudUsage } from "./cloud-usage";

const info = {
  id: "aa695df4-e66e-443a-bba2-4bb86c2605d8",
  status: "stopped" as const,
  cdpUrl: null,
  liveUrl: null,
  timeoutAt: "2026-09-09T10:00:00Z",
  browserCost: "0.01234",
  proxyCost: "0.000001",
};

test("hosting cost reports replace retries instead of adding them twice", () => {
  const first = recordCloudUsage(undefined, info.id, info, 100);
  const repeated = recordCloudUsage(first, info.id, info, 200);
  expect(repeated).toEqual({ ...first, updatedAt: 200 });
  const next = recordCloudUsage(repeated, "another-browser", info, 300);
  expect(next.sessions).toBe(2);
  expect(next.browserUsdMicros).toBe(24_680);
  expect(next.proxyUsdMicros).toBe(2);
});

test("unreported hosting costs stay visible and can be reconciled", () => {
  const unknown = recordCloudUsage(undefined, info.id, null, 100);
  expect(unknown.unreportedSessions).toBe(1);
  expect(unknown.lastBrowserUsdMicros).toBeNull();
  const recovered = recordCloudUsage(unknown, info.id, info, 200);
  expect(recovered.sessions).toBe(1);
  expect(recovered.unreportedSessions).toBe(0);
  expect(recovered.browserUsdMicros).toBe(12_340);
});
