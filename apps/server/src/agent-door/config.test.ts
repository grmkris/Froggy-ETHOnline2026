/**
 * A key pasted into the account variable must be described, never quoted.
 *
 * These two variables sit on adjacent lines of one install command, so the
 * likeliest misconfiguration is a swap, and a refusal that echoed the value
 * would put the key in the agent's context.
 */

import { describe, expect, it } from "bun:test";

import { ACCOUNT_VARIABLE, unconfigured } from "./config";

const KEY = `0x${"ab".repeat(32)}`;

describe("unconfigured, when a key is pasted into the account variable", () => {
  it("describes the value and never quotes it", () => {
    const said = unconfigured({
      FROGGY_HEDERA_ACCOUNT_ID: KEY,
      FROGGY_HEDERA_PRIVATE_KEY: KEY,
    });
    expect(said).toContain(ACCOUNT_VARIABLE);
    expect(said).toContain("a 66-character hexadecimal string");
    expect(said).toContain("have not been swapped");
    expect(said).not.toContain(KEY);
    expect(said).not.toContain("abab");
  });
});
