/**
 * The CLI, served by the server that it talks to.
 *
 * An outside agent's sandbox has Node and curl and nothing of ours, and the
 * repository may be private on the day. So the server builds the CLI from
 * its own source once, on first request, and hands it out at
 * `/froggy-cli.js`; the skill text tells the agent to curl it. Built at run
 * time rather than at image build time so there is no artefact to forget.
 */

const CLI_SOURCE = new URL("cli/froggy.ts", import.meta.url).pathname;

let built: Promise<string | null> | null = null;

/**
 * `Bun.build` rejects on a bundling failure rather than answering
 * `{ success: false }`. Without this catch the module-level promise caches the
 * rejection, the reset below never runs, and one bad build takes the route out
 * until the process restarts.
 */
const build = async (): Promise<string | null> => {
  try {
    const result = await Bun.build({
      entrypoints: [CLI_SOURCE],
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
      "[cli] could not be built:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
};

export const serveCli = async (): Promise<Response> => {
  built ??= build();
  const source = await built;
  if (source === null) {
    built = null;
    return Response.json(
      { error: "The CLI could not be built." },
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
