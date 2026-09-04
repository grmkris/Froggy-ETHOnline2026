import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "docs/research/original-research.md",
    // Matches the exclusions in oxlint.config.ts and knip.json: one-off probes,
    // deliberately outside `bun run check`. See tools/spikes/README.md.
    "tools/spikes/**",
  ],
});
