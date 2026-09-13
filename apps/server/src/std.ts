/**
 * Effect Schema → the AI SDK's tool schema.
 *
 * The SDK accepts any Standard Schema whose `~standard` carries both a
 * `validate` (to check the model's arguments) and a `jsonSchema` (to tell the
 * model what to send). Effect produces those from two different calls —
 * `toStandardSchemaV1` and `toStandardJSONSchemaV1` — and each result's
 * `~standard` is missing the other's half. Merging them is the whole job, and
 * it is what keeps Zod out of the repository: `AGENTS.md` reserves schema
 * duties for Effect, and a second schema library would mean two definitions of
 * every tool's arguments, free to drift apart at exactly the boundary an
 * attacker would most like them to.
 *
 * One tolerance on top: the model sometimes sends a nested object, an array
 * or a number as its JSON text — `"{\"_tag\":\"wallet\"}"` where the schema
 * wants the object. Every such call used to be refused, the model retried
 * with the same shape, and the person watched a reminder or a watchlist save
 * fail five times. When the arguments do not validate as sent, the string at
 * each path the validator complained about is parsed as JSON and the result
 * is validated again, a few rounds deep. A repair that still fails is
 * discarded and the original refusal is what the model sees, and a string
 * field the schema accepted is never touched, JSON-looking or not.
 *
 * The return type is stated as the SDK's own `StandardSchema<T>` rather than
 * inferred. Effect's schema type carries a dozen internal phantom fields that
 * the SDK's `FlexibleSchema` union cannot match structurally, and this is the
 * one place that mismatch is worth naming instead of propagating.
 */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from "@standard-schema/spec";
import { Predicate, Schema } from "effect";

type ToolSchema<T> = StandardSchemaV1<unknown, T> & {
  readonly "~standard": StandardSchemaV1.Props<unknown, T> & {
    readonly jsonSchema: StandardJSONSchemaV1.Converter;
  };
};

/** Rounds of parse-and-revalidate: a string inside a parsed string is as deep as it goes. */
const REPAIR_ROUNDS = 3;
type Json = Schema.Json;
const isJson = Schema.is(Schema.Json);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const isJsonRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));
const decodeJsonText = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Json)
);

/** The key an issue segment names; the spec allows a bare key or `{ key }`. */
const keyOf = (
  segment: PropertyKey | { readonly key: PropertyKey }
): PropertyKey =>
  Predicate.hasProperty(segment, "key") ? segment.key : segment;

/** `text` as JSON, or nothing when it is not JSON. */
const parsed = (text: string): Json | undefined => {
  const result = decodeJsonText(text);
  return result._tag === "Success" ? result.success : undefined;
};

/**
 * `value` with the first string on `path` parsed as JSON, or nothing when
 * there is no string there to parse. Only the path the validator complained
 * about is touched, so a string field the schema accepted is never rewritten,
 * JSON-looking or not.
 */
const parseAt = (
  value: Json,
  path: readonly PropertyKey[]
): Json | undefined => {
  if (Predicate.isString(value)) {
    return parsed(value);
  }
  const [head, ...rest] = path;
  if (head === undefined || Predicate.isSymbol(head)) {
    return undefined;
  }
  if (isJsonArray(value)) {
    const index = Number(head);
    const entry = value[index];
    if (!Number.isInteger(index) || entry === undefined) {
      return undefined;
    }
    const inner = parseAt(entry, rest);
    return inner === undefined
      ? undefined
      : value.map((item, at) => (at === index ? inner : item));
  }
  if (isJsonRecord(value)) {
    const key = String(head);
    const entry = value[key];
    if (entry === undefined) {
      return undefined;
    }
    const inner = parseAt(entry, rest);
    return inner === undefined ? undefined : { ...value, [key]: inner };
  }
  return undefined;
};

export const std = <S extends Schema.Codec<unknown>>(
  schema: S
): ToolSchema<S["Type"]> => {
  const validator = Schema.toStandardSchemaV1(schema);
  const json = Schema.toStandardJSONSchemaV1(schema);
  const { validate } = validator["~standard"];
  type Result = StandardSchemaV1.Result<S["Type"]>;
  /** Parse where the validator objected, validate again, and repeat while that changes something. */
  const repaired = async (
    current: Json,
    issues: readonly StandardSchemaV1.Issue[],
    asSent: Result,
    round: number
  ): Promise<Result> => {
    if (round >= REPAIR_ROUNDS) {
      return asSent;
    }
    let next = current;
    let changed = false;
    for (const issue of issues) {
      const attempt = parseAt(next, (issue.path ?? []).map(keyOf));
      if (attempt !== undefined) {
        next = attempt;
        changed = true;
      }
    }
    if (!changed) {
      return asSent;
    }
    const result = await validate(next);
    return result.issues
      ? await repaired(next, result.issues, asSent, round + 1)
      : result;
  };
  const merged = {
    ...validator,
    "~standard": {
      ...validator["~standard"],
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the Standard Schema contract hands the model's raw arguments in as `unknown`; parsing them is this function's whole job.
      validate: async (value: unknown): Promise<Result> => {
        const asSent = await validate(value);
        if (!asSent.issues || !isJson(value)) {
          return asSent;
        }
        return await repaired(value, asSent.issues, asSent, 0);
      },
      jsonSchema: json["~standard"].jsonSchema,
    },
  };
  // Both halves of the Standard Schema contract are present: `validate` from
  // the codec and `jsonSchema` from the JSON converter, produced by Effect from
  // the *same* schema, so they cannot describe different shapes.
  return merged;
};
