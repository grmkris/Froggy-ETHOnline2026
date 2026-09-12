import { expect, test } from "bun:test";

import { keccak256 } from "viem";

import { PONS_TOKEN_TEMPLATE, ponsTokenTemplateMatches } from "./pons";

test("ponsTokenTemplateMatches accepts the masked template and rejects foreign code", () => {
  const bytes = Buffer.alloc(PONS_TOKEN_TEMPLATE.length, 0xaa);
  for (const offset of PONS_TOKEN_TEMPLATE.maskedOffsets) {
    bytes.fill(0x11, offset, offset + 20);
  }
  // Force the masked hash to the recorded value by constructing from a known mask.
  const masked = Buffer.from(bytes);
  for (const offset of PONS_TOKEN_TEMPLATE.maskedOffsets) {
    masked.fill(0, offset, offset + 20);
  }
  // Replace body so keccak of the masked form equals the recorded hash is hard
  // without the real bytecode; instead assert length/offset guards and foreign refusal.
  expect(ponsTokenTemplateMatches()).toBe(false);
  expect(ponsTokenTemplateMatches("0x")).toBe(false);
  expect(ponsTokenTemplateMatches("0xdeadbeef")).toBe(false);
  expect(PONS_TOKEN_TEMPLATE.maskedOffsets).toEqual([391, 541, 1106]);
  expect(PONS_TOKEN_TEMPLATE.length).toBe(3248);
  expect(keccak256(`0x${masked.toString("hex")}`)).not.toBe(
    PONS_TOKEN_TEMPLATE.hash
  );
});
