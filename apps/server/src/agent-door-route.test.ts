/**
 * What the server hands an outside agent.
 *
 * The bundle itself is six megabytes of Hedera SDK and takes a real build to
 * produce, so what is tested here is the part that differs per request and had
 * no coverage: the line that tells the downloaded copy which Froggy it came
 * from. Without it, a door served by a testnet deployment or a fork points at
 * our mainnet — and the skill served beside it says otherwise.
 */

import { describe, expect, it } from "bun:test";

import { stamped } from "./agent-door-route";

const SHEBANG = "#!/usr/bin/env node";

describe("stamping the served door with its origin", () => {
  it("puts the origin below the shebang, so Node still sees it first", () => {
    const out = stamped(`${SHEBANG}\nimport "x";\n`, "https://froggy.test");
    const [first, second] = out.split("\n");
    expect(first).toBe(SHEBANG);
    expect(second).toBe(
      'process.env.FROGGY_DEFAULT_URL ||= "https://froggy.test";'
    );
  });

  it("does not overwrite an origin the caller set themselves", () => {
    // `||=`, so FROGGY_URL and an explicitly exported default both still win.
    expect(stamped(`${SHEBANG}\n`, "https://froggy.test")).toContain("||=");
  });

  it("escapes the origin rather than pasting it into source", () => {
    const out = stamped(`${SHEBANG}\n`, 'https://x.test/"; evil()//');
    expect(out).toContain(
      'process.env.FROGGY_DEFAULT_URL ||= "https://x.test/\\"; evil()//";'
    );
  });

  it("still stamps a bundle that has no shebang", () => {
    const out = stamped('import "x";\n', "https://froggy.test");
    expect(out.startsWith("process.env.FROGGY_DEFAULT_URL")).toBe(true);
  });
});
