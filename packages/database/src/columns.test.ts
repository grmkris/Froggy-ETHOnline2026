import { describe, expect, it } from "bun:test";

import { SpendId } from "@froggy/domain";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Schema } from "effect";

import { spends } from "./schema";

const idColumn = getTableConfig(spends).columns.find(
  (column) => column.name === "id"
);

describe("typeIdPrimaryKey", () => {
  it("declares a native uuid primary key", () => {
    // The prefix lives in the type, not the database: storing the underlying
    // UUID is what keeps index size and ordering equal to a plain UUID key.
    expect(idColumn?.getSQLType()).toBe("uuid");
    expect(idColumn?.primary).toBe(true);
  });

  it("defaults to a freshly generated identifier of the column's entity", () => {
    // Decoding rather than inspecting: the default must satisfy the same schema
    // the wire uses, not merely be a string that looks close enough.
    const generated = Schema.decodeUnknownSync(SpendId)(
      idColumn?.defaultFn?.()
    );

    expect(generated).toStartWith("spn_");
  });

  it("writes the underlying UUID and reads back the prefixed identifier", () => {
    const id = SpendId.generate();
    const driverValue = idColumn?.mapToDriverValue(id);

    expect(driverValue).toBe(SpendId.toUuid(id));
    expect(idColumn?.mapFromDriverValue(driverValue)).toBe(id);
  });

  it("rejects an identifier belonging to another entity", () => {
    // `toDriver` is the last checkpoint before the driver: a mislabelled
    // identifier must fail here rather than write a valid-looking row.
    expect(() =>
      idColumn?.mapToDriverValue("ses_01m1phrcs3e4f99z79n1bharhn")
    ).toThrow();
  });
});
