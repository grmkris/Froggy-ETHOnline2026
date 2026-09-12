import { expect, test } from "bun:test";

import { keccak256 } from "viem";

import { PONS_TOKEN_TEMPLATE, ponsTokenTemplateMatches } from "./pons";
import { maskedTemplateMatches } from "./venues/common";

test("ponsTokenTemplateMatches keeps its pinned regions and rejects foreign code", () => {
  expect(ponsTokenTemplateMatches()).toBe(false);
  expect(ponsTokenTemplateMatches("0x")).toBe(false);
  expect(ponsTokenTemplateMatches("0xdeadbeef")).toBe(false);
  expect(PONS_TOKEN_TEMPLATE.regions.map((region) => region.offset)).toEqual([
    391, 541, 1106,
  ]);
  expect(PONS_TOKEN_TEMPLATE.length).toBe(3248);
  const wrongBody = Buffer.alloc(PONS_TOKEN_TEMPLATE.length, 0xaa);
  expect(ponsTokenTemplateMatches(`0x${wrongBody.toString("hex")}`)).toBe(
    false
  );
});

test("maskedTemplateMatches ignores masked regions and nothing else", () => {
  const body = Buffer.alloc(64, 0xaa);
  const template = {
    length: 64,
    regions: [{ offset: 4, length: 20 }],
    hash: keccak256(`0x${Buffer.from(body).fill(0, 4, 24).toString("hex")}`),
  };
  const withAdmin = Buffer.from(body).fill(0x77, 4, 24);
  expect(
    maskedTemplateMatches(`0x${withAdmin.toString("hex")}`, template)
  ).toBe(true);
  const flipped = Buffer.from(withAdmin);
  flipped[40] = 0x00;
  expect(maskedTemplateMatches(`0x${flipped.toString("hex")}`, template)).toBe(
    false
  );
  expect(
    maskedTemplateMatches(
      `0x${withAdmin.subarray(1).toString("hex")}`,
      template
    )
  ).toBe(false);
});
