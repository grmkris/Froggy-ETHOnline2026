/**
 * Spike: what in the workspace is never imported by an app?
 *
 * Usage: bun tools/spikes/verify-unused-surface.ts
 */
const files: string[] = [];
const glob = new Bun.Glob("**/*.{ts,tsx}");
for await (const path of glob.scan({
  cwd: ".",
  onlyFiles: true,
})) {
  if (
    path.includes("node_modules/") ||
    path.includes("dist/") ||
    path.startsWith("tools/spikes/")
  ) {
    continue;
  }
  files.push(path);
}

const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    text: await Bun.file(path).text(),
  }))
);

const report = (
  label: string,
  needle: string,
  self: string
): { label: string; importers: readonly string[] } => ({
  importers: sources
    .filter(
      ({ path, text }) =>
        !path.startsWith(self) &&
        (text.includes(`from "${needle}`) ||
          text.includes(`from '${needle}`) ||
          text.includes(`"${needle}/`) ||
          text.includes(`'${needle}/`))
    )
    .map(({ path }) => path),
  label,
});

const rows = [
  report("@froggy/chain", "@froggy/chain", "packages/chain/"),
  report("@froggy/database", "@froggy/database", "packages/database/"),
  report("@froggy/contracts", "@froggy/contracts", "packages/contracts/"),
  report("lucide-react (ui pkg)", "lucide-react", "packages/ui/"),
  report("sonner", "sonner", "packages/ui/"),
  report("@tanstack/react-query", "@tanstack/react-query", "apps/web/"),
  report("wagmi", "wagmi", "apps/web/"),
  report("viem (web)", "viem", "apps/web/"),
  report("viem (chain)", "viem", "packages/chain/"),
  report("@react-three/drei", "@react-three/drei", "packages/game-three/"),
  report("vite", "vite", "apps/web/"),
  report("@vitejs/plugin-react", "@vitejs/plugin-react", "apps/web/"),
  report("@tailwindcss/vite", "@tailwindcss/vite", "apps/web/"),
];

console.table(
  rows.map((row) => ({
    importers: row.importers.length === 0 ? "NONE" : row.importers.join(", "),
    surface: row.label,
  }))
);
