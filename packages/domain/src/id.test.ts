import { describe, expect, it } from "bun:test";

import { Schema } from "effect";

import { makeIdSchema, RunId, SessionId } from "./id";

describe("makeIdSchema", () => {
  it("generates prefixed identifiers of the specification length", () => {
    const id = SessionId.generate();
    expect(id).toStartWith("ses_");
    expect(id.length).toBe("ses".length + 1 + 26);
  });

  it("generates distinct identifiers", () => {
    expect(SessionId.generate()).not.toBe(SessionId.generate());
  });

  it("decodes an identifier it generated", () => {
    const id = RunId.generate();
    expect(Schema.decodeUnknownSync(RunId)(id)).toBe(id);
  });

  it("rejects an identifier carrying another prefix", () => {
    const runId = RunId.generate();
    expect(SessionId.is(runId)).toBe(false);
    expect(() => Schema.decodeUnknownSync(SessionId)(runId)).toThrow();
  });

  it("rejects a suffix of the wrong length", () => {
    expect(SessionId.is("ses_0000000000e00800000000000")).toBe(false);
  });

  it("rejects a correctly shaped suffix outside the base32 alphabet", () => {
    expect(SessionId.is("ses_0000000000e00800000000000u")).toBe(false);
    expect(SessionId.is("ses_0000000000E008000000000000")).toBe(false);
  });

  it("rejects a suffix that overflows 128 bits", () => {
    expect(SessionId.is("ses_8zzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(false);
  });

  it("round-trips through its UUID representation", () => {
    const id = SessionId.generate();
    expect(SessionId.fromUuid(SessionId.toUuid(id))).toBe(id);
  });

  it("refuses to register a prefix another identifier already claimed", () => {
    expect(() => makeIdSchema("ses", "DuplicateSessionId")).toThrow(
      /already claimed by SessionId/u
    );
  });
});
