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

let built: Promise<string | null> | null = null;

const build = async (): Promise<string | null> => {
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
};

export const serveAgentDoor = async (): Promise<Response> => {
  built ??= build();
  const source = await built;
  if (source === null) {
    built = null;
    return Response.json(
      { error: "The agent door could not be built." },
      { status: 500 }
    );
  }
  return new Response(source, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "text/javascript; charset=utf-8",
    },
  });
};
