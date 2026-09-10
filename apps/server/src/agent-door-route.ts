/**
 * The agent door, served by the server it buys from.
 *
 * Same reasoning as the CLI beside it: a stranger's agent has Node and curl
 * and nothing of ours, and the repository may be private on the day. The
 * server builds the door from its own source on first request and hands it
 * out at `/froggy-mcp.js`, so there is no published artefact to keep in step
 * with the seller and nothing to forget at image build time.
 *
 * What is served holds no key and no credential of ours. The caller supplies
 * their own Hedera account in their own environment; this file only hands
 * over the program that reads it.
 */

const DOOR_SOURCE = new URL("agent-door/server.ts", import.meta.url).pathname;

const SHEBANG = "#!/usr/bin/env node";

let built: Promise<string | null> | null = null;

/**
 * `Bun.build` rejects on a bundling failure rather than answering
 * `{ success: false }`, so the failure has to be caught here. Without the
 * catch the module-level promise below caches a *rejection*: the recovery that
 * clears it never runs, and every later request re-awaits the same failure
 * until the process restarts.
 */
const build = async (): Promise<string | null> => {
  try {
    const result = await Bun.build({
      entrypoints: [DOOR_SOURCE],
      minify: false,
      target: "node",
    });
    const [output] = result.outputs;
    if (!result.success || output === undefined) {
      return null;
    }
    return await output.text();
  } catch (error) {
    console.warn(
      "[agent-door] could not be built:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
};

/**
 * Tell the copy which server it came from.
 *
 * The bundle is the same bytes for everyone; only this line differs, so the
 * build stays cached. A door downloaded from a testnet deployment or from
 * somebody's fork then buys from that deployment by default rather than from
 * whatever origin happened to be compiled in — which is also what the skill
 * text beside it has always said happens.
 */
export const stamped = (source: string, origin: string): string =>
  source.startsWith(SHEBANG)
    ? source.replace(
        SHEBANG,
        `${SHEBANG}\nprocess.env.FROGGY_DEFAULT_URL ||= ${JSON.stringify(origin)};`
      )
    : `process.env.FROGGY_DEFAULT_URL ||= ${JSON.stringify(origin)};\n${source}`;

export const serveAgentDoor = async (origin: string): Promise<Response> => {
  built ??= build();
  const source = await built;
  if (source === null) {
    built = null;
    return Response.json(
      { error: "The agent door could not be built." },
      { status: 500 }
    );
  }
  return new Response(stamped(source, origin), {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "text/javascript; charset=utf-8",
    },
  });
};
