import type { UserId } from "@froggy/domain";
import { GraphReadInput, GraphSchemaInput } from "@froggy/graph";
import { tool } from "ai";
import { Schema } from "effect";

import { ResearchReadInput } from "./research-data";
import { researchGuide, ResearchGuideInput } from "./research-guides";
import type { Services } from "./services";
import { std } from "./std";

const bounded = async <T>(read: () => Promise<T>) => {
  try {
    const value = await read();
    const text = JSON.stringify(value);
    return text.length <= 20_000
      ? text
      : JSON.stringify({
          v: 1,
          status: "unavailable",
          note: "Result exceeds the tool budget. Select fewer fields or rows.",
        });
  } catch (error) {
    return JSON.stringify({
      v: 1,
      status: "unavailable",
      note:
        error instanceof Error &&
        /^(?:graph\.query|graph\.http|research\.capacity):/u.test(error.message)
          ? error.message.slice(0, 500)
          : "Research request failed validation or provider access. Inspect the schema, reduce the query, or check provider configuration.",
    });
  }
};
export const buildResearchTools = (services: Services, owner: UserId) => ({
  research_capabilities: tool({
    description:
      "Read included research datasets, provider configuration and quotas. Does not grant execution authority.",
    inputSchema: std(Schema.Struct({})),
    execute: () => services.researchData.capabilities(),
  }),
  research_guide: tool({
    description:
      "Read a short curated workflow for Ethereum, subgraphs, tokens, predictions, perpetuals, DeFi or Hedera research.",
    inputSchema: std(ResearchGuideInput),
    execute: researchGuide,
  }),
  research_read: tool({
    description:
      "Included bounded market/indexer read. Inspect capabilities and networks; specify exact identifiers. Preserves unavailable, stale and partial coverage. No purchase or trading authority.",
    inputSchema: std(ResearchReadInput),
    execute: async (input) =>
      await bounded(async () => await services.researchData.read(owner, input)),
  }),
  graph_schema: tool({
    description:
      "Inspect a discovered deployment's query or object fields before a general Graph read. Included; schema compatibility does not establish publisher or network identity.",
    inputSchema: std(GraphSchemaInput),
    execute: async (input) =>
      await bounded(
        async () =>
          await services.researchData.limit(
            owner,
            async () => await services.graphExplorer.schema(input)
          )
      ),
  }),
  graph_read: tool({
    description:
      "Included general GraphQL query against a discovered deployment. Schema checked; query only, explicit first 1..50, no aliases/fragments, depth at most 6. Indexed research only; not signing evidence.",
    inputSchema: std(GraphReadInput),
    execute: async (input) =>
      await bounded(
        async () =>
          await services.researchData.limit(
            owner,
            async () => await services.graphExplorer.read(input)
          )
      ),
  }),
});

export const ResearchDiscoverInput = Schema.Struct({
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  contract: Schema.optional(
    Schema.String.check(Schema.isPattern(/^0x[0-9a-fA-F]{40}$/u))
  ),
  chain: Schema.optional(Schema.String.check(Schema.isMaxLength(40))),
});
export const discoverResearch = async (
  services: Services,
  owner: UserId,
  input: typeof ResearchDiscoverInput.Type
) =>
  await services.researchData.limit(owner, async () => {
    if (input.contract !== undefined) {
      if (input.chain === undefined || input.chain === "") {
        throw new Error(
          "graph.query: contract discovery requires a Graph network ID."
        );
      }
      return await services.graphDiscovery.byContract({
        chain: input.chain,
        contract: input.contract,
      });
    }
    if (input.query === undefined || input.query === "") {
      throw new Error(
        "graph.query: provide a protocol name or contract and chain."
      );
    }
    return await services.graphDiscovery.byKeyword(input.query);
  });
