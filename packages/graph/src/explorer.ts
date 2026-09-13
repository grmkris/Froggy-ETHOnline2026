import { Result, Schema } from "effect";
import {
  getIntrospectionQuery,
  getNamedType,
  isListType,
  isNonNullType,
  isObjectType,
  isInputObjectType,
  isInterfaceType,
  isEnumType,
  isScalarType,
  Kind,
  parse,
  print,
  TypeInfo,
  validate,
  valueFromASTUntyped,
  visit,
  visitWithTypeInfo,
} from "graphql";
import type { GraphQLSchema } from "graphql";

import type { DiscoveryFetch } from "./discovery";
import { gatewaySchema } from "./gateway-schema";

const GraphDeployment = Schema.String.check(
  Schema.isPattern(/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/u)
);
export const GraphSchemaInput = Schema.Struct({
  ipfsHash: GraphDeployment,
  type: Schema.optional(Schema.String.check(Schema.isMaxLength(100))),
});
export const GraphReadInput = Schema.Struct({
  ipfsHash: GraphDeployment,
  query: Schema.String.check(Schema.isMaxLength(8000)),
  variables: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
});
const ResponseBody = Schema.Struct({
  data: Schema.optionalKey(
    Schema.NullOr(Schema.Record(Schema.String, Schema.Json))
  ),
  errors: Schema.optionalKey(
    Schema.Array(Schema.Struct({ message: Schema.String }))
  ),
});

export const validateResearchQuery = (
  schema: GraphQLSchema,
  query: string,
  variables: Record<string, Schema.Json>
) => {
  const document = parse(query, { maxTokens: 1500 });
  if (
    document.definitions.length !== 1 ||
    document.definitions[0]?.kind !== Kind.OPERATION_DEFINITION ||
    document.definitions[0].operation !== "query"
  ) {
    throw new Error(
      "graph.query: use one query; fragments, mutations and subscriptions are not supported."
    );
  }
  const errors = validate(schema, document);
  if (errors.length > 0) {
    throw new Error(`graph.query: ${errors[0]?.message.slice(0, 400)}`);
  }
  let budget = 0;
  let depth = 0;
  let fields = 0;
  const multipliers = [1];
  const info = new TypeInfo(schema);
  visit(
    document,
    visitWithTypeInfo(info, {
      Field: {
        enter(node) {
          depth += 1;
          fields += 1;
          if (depth > 6 || fields > 80 || node.alias !== undefined) {
            throw new Error(
              "graph.query: depth/field budget exceeded or aliases used."
            );
          }
          const type = info.getType();
          const unwrapped = type && isNonNullType(type) ? type.ofType : type;
          let count = 1;
          if (unwrapped && isListType(unwrapped)) {
            const first = node.arguments?.find(
              (arg) => arg.name.value === "first"
            );
            const value: unknown = first
              ? valueFromASTUntyped(first.value, variables)
              : undefined;
            const decoded = Schema.decodeUnknownResult(
              Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))
            )(value);
            if (Result.isFailure(decoded)) {
              throw new Error(
                "graph.query: every list needs an explicit first between 1 and 50."
              );
            }
            count = decoded.success;
          }
          const multiplier = (multipliers.at(-1) ?? 1) * count;
          multipliers.push(multiplier);
          budget += multiplier;
          if (budget > 1000) {
            throw new Error("graph.query: nested result budget exceeded.");
          }
          if (node.name.value.startsWith("__")) {
            throw new Error("graph.query: use graph_schema for introspection.");
          }
        },
        leave() {
          depth -= 1;
          multipliers.pop();
        },
      },
    })
  );
  return print(document);
};

const readGraphResponse = async (
  response: Response,
  limit: number
): Promise<Schema.Json> => {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`graph.http: ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("graph.response: empty body");
  }
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- bounded stream consumption
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.byteLength;
      if (size > limit) {
        throw new Error("graph.response: size limit exceeded");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(text));
};

const withMetadata = (schema: GraphQLSchema, validated: string): string => {
  const metaType = schema.getType("_Meta_");
  const blockType = schema.getType("_Block_");
  const metaFields =
    metaType && isObjectType(metaType) ? metaType.getFields() : {};
  const blockFields =
    blockType && isObjectType(blockType) ? blockType.getFields() : {};
  const metaSelection = metaFields["block"]
    ? `_meta { block { number ${blockFields["timestamp"] ? "timestamp" : ""} } ${metaFields["deployment"] ? "deployment" : ""} ${metaFields["hasIndexingErrors"] ? "hasIndexingErrors" : ""} }`
    : "";
  return metaSelection
    ? print(
        visit(parse(validated), {
          OperationDefinition(node) {
            return {
              ...node,
              selectionSet: {
                ...node.selectionSet,
                selections: [
                  ...node.selectionSet.selections,
                  ...parse(`{ ${metaSelection} }`).definitions.flatMap((def) =>
                    def.kind === Kind.OPERATION_DEFINITION
                      ? def.selectionSet.selections
                      : []
                  ),
                ],
              },
            };
          },
        })
      )
    : validated;
};

const sourceMetadata = (data: Schema.Json | undefined, hash: string) => {
  const decoded = Schema.decodeUnknownResult(
    Schema.Struct({
      _meta: Schema.Struct({
        deployment: Schema.String,
        hasIndexingErrors: Schema.Boolean,
        block: Schema.Struct({
          number: Schema.Int,
          timestamp: Schema.optionalKey(Schema.NullOr(Schema.Int)),
        }),
      }),
    })
  )(data);
  if (Result.isFailure(decoded)) {
    return { indexedAt: null, stale: null, hasIndexingErrors: null };
  }
  const meta = decoded.success._meta;
  if (meta.deployment !== hash) {
    throw new Error("graph.response: gateway returned a different deployment.");
  }
  const indexedAt =
    meta.block.timestamp === undefined || meta.block.timestamp === null
      ? null
      : meta.block.timestamp * 1000;
  return {
    indexedAt,
    stale: indexedAt === null ? null : Date.now() - indexedAt > 300_000,
    hasIndexingErrors: meta.hasIndexingErrors,
  };
};

export const graphExplorer = (options: {
  apiKey: string;
  gatewayUrl: string;
  stubbed: boolean;
  fetch: DiscoveryFetch;
}) => {
  const schemas = new Map<string, GraphQLSchema>();
  const schemaFor = async (hash: string) => {
    Schema.decodeUnknownSync(GraphDeployment)(hash);
    const cached = schemas.get(hash);
    if (cached) {
      return cached;
    }
    // The MCP exposes authoring SDL; query/filter roots are generated by Graph Node.
    // Introspect the actual gateway schema so validation matches executable queries.
    const response = await options.fetch(
      `${options.gatewayUrl.replace(/\/$/u, "")}/${options.apiKey}/deployments/id/${hash}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: getIntrospectionQuery({ descriptions: false }),
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    const schema = gatewaySchema(await readGraphResponse(response, 1_048_576));
    if (schemas.size >= 16) {
      schemas.clear();
    }
    schemas.set(hash, schema);
    return schema;
  };
  return {
    schema: async (input: typeof GraphSchemaInput.Type) => {
      if (options.stubbed) {
        return {
          v: 1,
          stubbed: true,
          status: "unavailable",
          note: "Graph research is not configured; no live schema was read.",
        };
      }
      const schema = await schemaFor(input.ipfsHash);
      const type =
        input.type === undefined
          ? schema.getQueryType()
          : schema.getType(input.type);
      if (type && isEnumType(type)) {
        return {
          v: 1,
          stubbed: false,
          ipfsHash: input.ipfsHash,
          type: type.name,
          kind: "enum",
          values: type
            .getValues()
            .slice(0, 60)
            .map((value) => value.name),
          truncated: type.getValues().length > 60,
        };
      }
      if (type && isInputObjectType(type)) {
        const fields = Object.values(type.getFields());
        return {
          v: 1,
          stubbed: false,
          ipfsHash: input.ipfsHash,
          type: type.name,
          kind: "input",
          fields: fields
            .slice(0, 60)
            .map((field) => ({ name: field.name, type: String(field.type) })),
          truncated: fields.length > 60,
        };
      }
      if (type && isScalarType(type)) {
        return {
          v: 1,
          stubbed: false,
          ipfsHash: input.ipfsHash,
          type: type.name,
          kind: "scalar",
        };
      }
      if (!type || !(isObjectType(type) || isInterfaceType(type))) {
        throw new Error(
          "graph.schema: choose a query, object, input, enum or scalar type from the returned fields."
        );
      }
      const fields = Object.values(type.getFields());
      return {
        v: 1,
        stubbed: false,
        ipfsHash: input.ipfsHash,
        type: type.name,
        fields: fields.slice(0, 60).map((field) => ({
          name: field.name,
          type: String(field.type),
          entity: getNamedType(field.type).name,
          args: field.args.map((arg) => ({
            name: arg.name,
            type: String(arg.type),
          })),
        })),
        truncated: fields.length > 60,
        provenance:
          "Deployment schema verified; publisher and network must be independently checked.",
      };
    },
    read: async (input: typeof GraphReadInput.Type) => {
      if (options.stubbed) {
        return {
          v: 1,
          stubbed: true,
          status: "unavailable",
          note: "Graph research is not configured; no live query was executed.",
        };
      }
      const schema = await schemaFor(input.ipfsHash);
      const validated = validateResearchQuery(schema, input.query, {
        ...input.variables,
      });
      const query = withMetadata(schema, validated);
      const url = `${options.gatewayUrl.replace(/\/$/u, "")}/${options.apiKey}/deployments/id/${input.ipfsHash}`;
      const response = await options.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: input.variables ?? {} }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = Schema.decodeUnknownSync(ResponseBody)(
        await readGraphResponse(response, 256_000)
      );
      const metadata = sourceMetadata(body.data, input.ipfsHash);
      return {
        v: 1,
        stubbed: false,
        ipfsHash: input.ipfsHash,
        observedAt: Date.now(),
        ...metadata,
        query,
        data: body.data ?? null,
        errors:
          body.errors?.slice(0, 3).map((e) => e.message.slice(0, 300)) ?? [],
        network: null,
        note: "Indexed research data, not execution evidence. _meta reports source block when supported; missing timestamp means unknown freshness. Network and publisher are not established by schema compatibility.",
      };
    },
  };
};
