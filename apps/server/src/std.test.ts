import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import { std } from "./std";

const Input = Schema.Struct({
  source: Schema.Struct({
    _tag: Schema.Literal("wallet"),
    address: Schema.String,
  }),
  when: Schema.optional(
    Schema.Struct({ _tag: Schema.Literal("in"), minutes: Schema.Number })
  ),
  notes: Schema.String,
  waitMs: Schema.optional(Schema.Number),
});

const validate = async (value: Schema.Json) =>
  await std(Input)["~standard"].validate(value);

describe("std", () => {
  test("arguments sent as the schema describes pass through unchanged", async () => {
    const result = await validate({
      source: { _tag: "wallet", address: "0xabc" },
      notes: '{"kept":"as text"}',
    });
    expect(result.issues).toBeUndefined();
    expect("value" in result ? result.value : null).toEqual({
      source: { _tag: "wallet", address: "0xabc" },
      notes: '{"kept":"as text"}',
    });
  });

  test("a nested object the model sent as JSON text is parsed, and a JSON-looking string field is left alone", async () => {
    const result = await validate({
      source: '{"_tag":"wallet","address":"0xabc"}',
      when: '{"_tag":"in","minutes":5}',
      notes: '{"kept":"as text"}',
    });
    expect(result.issues).toBeUndefined();
    expect("value" in result ? result.value : null).toEqual({
      source: { _tag: "wallet", address: "0xabc" },
      when: { _tag: "in", minutes: 5 },
      notes: '{"kept":"as text"}',
    });
  });

  test("a number sent as a string is parsed where the validator objected, and a numeric string field is kept", async () => {
    const result = await validate({
      source: { _tag: "wallet", address: "0xabc" },
      notes: "123",
      waitMs: "2000",
    });
    expect(result.issues).toBeUndefined();
    expect("value" in result ? result.value : null).toEqual({
      source: { _tag: "wallet", address: "0xabc" },
      notes: "123",
      waitMs: 2000,
    });
  });

  test("arguments that are wrong after every repair keep the original refusal", async () => {
    const result = await validate({
      source: '{"_tag":"token","address":"0xabc"}',
      notes: "n",
    });
    expect(result.issues).toBeDefined();
    expect(result.issues?.length ?? 0).toBeGreaterThan(0);
  });

  test("the JSON schema half still describes the same shape", () => {
    const json = std(Input)["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(JSON.stringify(json)).toContain('"source"');
  });
});
