import { expect, test } from "bun:test";

import { Schema } from "effect";
import { buildSchema, introspectionFromSchema } from "graphql";

import { graphExplorer, validateResearchQuery } from "./explorer";

const schema = buildSchema(
  "type Query { pools(first:Int):[Pool!]! } type Pool { id:ID!, liquidity:String!, tokens(first:Int):[Pool!]! }"
);
test("general subgraph queries validate against actual fields and bounded variables", () => {
  expect(
    validateResearchQuery(
      schema,
      "query($n:Int!){pools(first:$n){id liquidity}}",
      { n: 5 }
    )
  ).toContain("liquidity");
  expect(() =>
    validateResearchQuery(schema, "{pools(first:1){invented}}", {})
  ).toThrow("Cannot query field");
});
test("rejects unbounded reads and attempts to bypass the query budget", () => {
  for (const query of [
    "{pools{id}}",
    "{pools(first:51){id}}",
    "{alias:pools(first:1){id}}",
    "{pools(first:50){tokens(first:50){id}}}",
    "query{pools(first:1){...P}} fragment P on Pool{id}",
    "mutation {pools(first:1){id}}",
  ]) {
    expect(() => validateResearchQuery(schema, query, {})).toThrow();
  }
});

test("gateway introspection validates real query roots and attaches source metadata", async () => {
  const runtime = buildSchema(
    "type Query { pools(first:Int):[Pool!]!, _meta:_Meta_ } type Pool { id:ID! } type _Meta_ {deployment:String!,hasIndexingErrors:Boolean!,block:_Block_!} type _Block_ {number:Int!,timestamp:Int}"
  );
  const hash = "QmcXE5QVcBcvcaJddPxd8mFs6W9xt7STmwfgguoiM6ddAd";
  const queries: string[] = [];
  const explorer = graphExplorer({
    apiKey: "fixture-key",
    gatewayUrl: "https://graph.test/api",
    stubbed: false,
    fetch: async (_url, init) => {
      const { query } = Schema.decodeUnknownSync(
        Schema.fromJsonString(Schema.Struct({ query: Schema.String }))
      )(init?.body);
      queries.push(query);
      return await Promise.resolve(
        query.includes("IntrospectionQuery")
          ? Response.json({ data: introspectionFromSchema(runtime) })
          : Response.json({
              data: {
                pools: [{ id: "pool" }],
                _meta: {
                  deployment: hash,
                  hasIndexingErrors: false,
                  block: {
                    number: 123,
                    timestamp: Math.floor(Date.now() / 1000),
                  },
                },
              },
            })
      );
    },
  });
  expect(await explorer.schema({ ipfsHash: hash })).toMatchObject({
    type: "Query",
    stubbed: false,
  });
  const read = await explorer.read({
    ipfsHash: hash,
    query: "{pools(first:1){id}}",
  });
  expect(read).toMatchObject({ stale: false, hasIndexingErrors: false });
  expect(queries).toHaveLength(2);
  expect(queries[1]).toContain("_meta");
});
