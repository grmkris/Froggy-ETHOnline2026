import { Schema } from "effect";
import { buildSchema, parseValue, print } from "graphql";

const Name = Schema.String.check(Schema.isPattern(/^[_A-Za-z][_0-9A-Za-z]*$/u));
interface TypeReference {
  readonly kind: string;
  readonly name: string | null;
  readonly ofType?: TypeReference | null;
}
const TypeReference: Schema.Codec<TypeReference> = Schema.suspend(() =>
  Schema.Struct({
    kind: Name,
    name: Schema.NullOr(Name),
    ofType: Schema.optionalKey(Schema.NullOr(TypeReference)),
  })
);
const Argument = Schema.Struct({
  name: Name,
  type: TypeReference,
  defaultValue: Schema.NullOr(Schema.String),
});
const Field = Schema.Struct({
  name: Name,
  type: TypeReference,
  args: Schema.Array(Argument),
});
const Type = Schema.Struct({
  kind: Schema.Literals([
    "SCALAR",
    "OBJECT",
    "INTERFACE",
    "UNION",
    "ENUM",
    "INPUT_OBJECT",
  ]),
  name: Name,
  fields: Schema.optionalKey(Schema.NullOr(Schema.Array(Field))),
  inputFields: Schema.optionalKey(Schema.NullOr(Schema.Array(Argument))),
  enumValues: Schema.optionalKey(
    Schema.NullOr(Schema.Array(Schema.Struct({ name: Name })))
  ),
  interfaces: Schema.optionalKey(
    Schema.NullOr(Schema.Array(Schema.Struct({ name: Name })))
  ),
  possibleTypes: Schema.optionalKey(
    Schema.NullOr(Schema.Array(Schema.Struct({ name: Name })))
  ),
});
const Introspection = Schema.Struct({
  data: Schema.Struct({
    __schema: Schema.Struct({
      queryType: Schema.Struct({ name: Name }),
      types: Schema.Array(Type),
    }),
  }),
});
const reference = (type: TypeReference): string => {
  if (type.kind === "LIST" || type.kind === "NON_NULL") {
    if (type.ofType === undefined || type.ofType === null) {
      throw new Error("graph.schema: truncated type reference");
    }
    const inner = reference(type.ofType);
    return type.kind === "LIST" ? `[${inner}]` : `${inner}!`;
  }
  if (type.name === null) {
    throw new Error("graph.schema: unnamed type reference");
  }
  return type.name;
};
const argument = (arg: typeof Argument.Type): string =>
  `${arg.name}: ${reference(arg.type)}${arg.defaultValue === null ? "" : ` = ${print(parseValue(arg.defaultValue))}`}`;
const definition = (type: typeof Type.Type): string => {
  switch (type.kind) {
    case "SCALAR": {
      return `scalar ${type.name}`;
    }
    case "ENUM": {
      return `enum ${type.name} { ${(type.enumValues ?? []).map((value) => value.name).join(" ")} }`;
    }
    case "UNION": {
      return `union ${type.name} = ${(type.possibleTypes ?? []).map((value) => value.name).join(" | ")}`;
    }
    case "INPUT_OBJECT": {
      return `input ${type.name} { ${(type.inputFields ?? []).map(argument).join(" ")} }`;
    }
    case "OBJECT":
    case "INTERFACE": {
      const interfaces = type.interfaces ?? [];
      const fields = (type.fields ?? []).map(
        (field) =>
          `${field.name}${field.args.length === 0 ? "" : `(${field.args.map(argument).join(", ")})`}: ${reference(field.type)}`
      );
      return `${type.kind === "OBJECT" ? "type" : "interface"} ${type.name}${interfaces.length === 0 ? "" : ` implements ${interfaces.map((value) => value.name).join(" & ")}`} { ${fields.join(" ")} }`;
    }
  }
  throw new Error("graph.schema: unsupported introspection type");
};
/** Decode introspection at the boundary, retaining the actual query fields, arguments and types. */
export const gatewaySchema = (body: Schema.Json) => {
  const {
    data: { __schema: schema },
  } = Schema.decodeUnknownSync(Introspection)(body);
  const definitions = schema.types
    .filter((type) => !type.name.startsWith("__"))
    .map(definition);
  return buildSchema(
    `schema { query: ${schema.queryType.name} }\n${definitions.join("\n")}`
  );
};
