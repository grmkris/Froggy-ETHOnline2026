import { describe, expect, it } from "bun:test";

import { digestZone } from "./digest-zone";

describe("digestZone", () => {
  it("keeps a saved zone and suggests the browser only when none is on", () => {
    expect(
      digestZone({ hour: 8, timezone: "Europe/Berlin" }, "America/New_York")
    ).toEqual({
      display: "Europe/Berlin",
      save: "Europe/Berlin",
      saved: true,
    });
    expect(
      digestZone({ hour: null, timezone: "UTC" }, "America/New_York")
    ).toEqual({
      display: "America/New_York",
      save: "America/New_York",
      saved: false,
    });
    expect(digestZone(undefined, "America/New_York").saved).toBe(false);
  });
});
