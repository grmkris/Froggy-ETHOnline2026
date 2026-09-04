import { Schema } from "effect";

import { nodes } from "./graph.ts";

/**
 * Whole-repository properties of the declaration in `tools/graph.ts`.
 *
 * Per-file import rules are enforced by `tools/oxlint/boundaries.ts`, which
 * runs in the editor. The checks here need the whole workspace set at once, so
 * they cannot be a lint rule: that a package is registered at all, that its
 * declared edges match its manifest, and that nothing sits in the repository
 * unreachable and unexplained.
 */

/** package.json is an I/O boundary like any other, so it is decoded. */
const Manifest = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  workspaces: Schema.optional(Schema.Array(Schema.String)),
});

const decodeManifest = Schema.decodeUnknownSync(Manifest);

const readManifest = async (path: string): Promise<typeof Manifest.Type> =>
  decodeManifest(await Bun.file(path).json());

const root = await readManifest("package.json");
const failures: string[] = [];

/** Directories matched by the root `workspaces` globs. */
const scanPattern = async (pattern: string): Promise<string[]> => {
  const found: string[] = [];
  const glob = new Bun.Glob(`${pattern}/package.json`);
  for await (const match of glob.scan({ onlyFiles: true })) {
    found.push(match.replace(/\/package\.json$/u, ""));
  }
  return found;
};

const scanned = await Promise.all((root.workspaces ?? []).map(scanPattern));
const workspaceDirs = scanned.flat();

// 1. Every workspace is declared, and every declaration is a real workspace.
// Without this the single-source-of-truth claim is hollow, because a new
// package would simply be unregulated rather than rejected.
const declaredDirs = new Set(nodes.map((node) => node.dir));
for (const dir of workspaceDirs) {
  if (!declaredDirs.has(dir)) {
    failures.push(
      `${dir} is a workspace but has no entry in tools/graph.ts. Add one naming what it owns and what it may import.`
    );
  }
}
for (const node of nodes) {
  if (!workspaceDirs.includes(node.dir)) {
    failures.push(
      `tools/graph.ts declares ${node.dir}, which is not a workspace. Remove the entry or add the package.`
    );
  }
}

// 2. Declared edges and manifest dependencies agree. Nothing here stops an
// agent from editing the declaration, but it makes a false edge a two-file
// change that a reviewer sees rather than a one-line edit.
const byName = new Map(
  nodes.filter((node) => node.name !== null).map((node) => [node.name, node])
);
const declaredWorkspaces = nodes.filter((node) =>
  workspaceDirs.includes(node.dir)
);
const manifests = await Promise.all(
  declaredWorkspaces.map(
    async (node) => await readManifest(`${node.dir}/package.json`)
  )
);

for (const [index, node] of declaredWorkspaces.entries()) {
  const deps = Object.keys(manifests[index]?.dependencies ?? {});
  const workspaceDeps = deps.filter((dep) => byName.has(dep));

  for (const edge of node.mayImport) {
    if (!workspaceDeps.includes(edge)) {
      failures.push(
        `${node.dir} declares mayImport "${edge}" in tools/graph.ts, but ${node.dir}/package.json does not depend on it.`
      );
    }
  }
  for (const dep of workspaceDeps) {
    if (!node.mayImport.includes(dep)) {
      failures.push(
        `${node.dir}/package.json depends on ${dep}, but tools/graph.ts does not list it in mayImport.`
      );
    }
  }
}

// 3. A package unreachable from an app must say why it is still here, and a
// package that is reachable must not carry a stale excuse for existing.
const reachable = new Set<string>();
const visit = (name: string): void => {
  const node = byName.get(name);
  if (node === undefined || reachable.has(node.dir)) {
    return;
  }
  reachable.add(node.dir);
  for (const edge of node.mayImport) {
    visit(edge);
  }
};
for (const node of nodes) {
  if (node.layer === "app") {
    reachable.add(node.dir);
    for (const edge of node.mayImport) {
      visit(edge);
    }
  }
}
for (const node of nodes) {
  const isReachable = reachable.has(node.dir);
  if (!isReachable && node.seam === undefined) {
    failures.push(
      `${node.dir} is not reachable from any app and declares no seam. AGENTS.md: "Prefer the smallest complete vertical slice over placeholder packages or unused infrastructure." Wire it into a slice, delete it, or declare seam: { consumer, reason }.`
    );
  }
  if (isReachable && node.seam !== undefined) {
    failures.push(
      `${node.dir} is reachable from an app but still declares a seam ("${node.seam.reason}"). Remove the seam; it has been wired.`
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exitCode = 1;
} else {
  console.info(
    `Graph check passed (${nodes.length} workspaces, ${reachable.size} reachable from an app)`
  );
}
