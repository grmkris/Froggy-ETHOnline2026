/**
 * Drizzle column helpers for TypeID primary and foreign keys.
 *
 * The column stores the underlying UUIDv7 in a native Postgres `uuid` column
 * — compact, indexable, and correctly ordered — while the application only
 * ever sees the prefixed, branded string. The helper takes the identifier
 * schema itself rather than a prefix name, so the column, the generated
 * default, and the decoded type all come from one declaration in
 * `@froggy/domain` and cannot disagree.
 */

import type { IdSchema, TypeId } from "@froggy/domain";
import { customType } from "drizzle-orm/pg-core";

export const typeIdColumn = <
  const Prefix extends string,
  const Name extends string,
>(
  id: IdSchema<Prefix, Name>,
  columnName: string
) =>
  customType<{ data: TypeId<Prefix, Name>; driverData: string }>({
    dataType() {
      return "uuid";
    },
    fromDriver(value: string): TypeId<Prefix, Name> {
      return id.fromUuid(value);
    },
    toDriver(value: TypeId<Prefix, Name>): string {
      return id.toUuid(value);
    },
  })(columnName);

export const typeIdPrimaryKey = <
  const Prefix extends string,
  const Name extends string,
>(
  id: IdSchema<Prefix, Name>
) =>
  typeIdColumn(id, "id")
    .primaryKey()
    .$defaultFn(() => id.generate());
