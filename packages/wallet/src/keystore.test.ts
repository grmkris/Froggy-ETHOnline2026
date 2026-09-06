import { describe, expect, it } from "bun:test";

import { aesGcmKeystore, KeystoreError } from "./keystore";

const KEK = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const OTHER = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");

/** What a promise rejected with, or null when it resolved. */
const failureOf = async (work: Promise<unknown>): Promise<Error | null> => {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

describe("aesGcmKeystore", () => {
  it("opens what it sealed, and seals the same key differently each time", async () => {
    const keystore = aesGcmKeystore(KEK);
    const first = await keystore.seal("0xabc");
    const second = await keystore.seal("0xabc");
    expect(first).not.toBe(second);
    expect(first.startsWith("v1.")).toBe(true);
    expect(await keystore.open(first)).toBe("0xabc");
    expect(await keystore.open(second)).toBe("0xabc");
  });

  it("refuses another key, altered bytes and a foreign format", async () => {
    const sealed = await aesGcmKeystore(KEK).seal("0xabc");
    expect(await failureOf(aesGcmKeystore(OTHER).open(sealed))).toBeInstanceOf(
      KeystoreError
    );
    const [version, nonce, body] = sealed.split(".");
    const altered = `${version}.${nonce}.${body?.slice(0, -4)}AAAA`;
    expect(await failureOf(aesGcmKeystore(KEK).open(altered))).toBeInstanceOf(
      KeystoreError
    );
    expect(await failureOf(aesGcmKeystore(KEK).open("0xabc"))).toBeInstanceOf(
      KeystoreError
    );
  });

  it("refuses a key of the wrong size before sealing anything", () => {
    expect(() => aesGcmKeystore("c2hvcnQ=")).toThrow(KeystoreError);
  });
});
