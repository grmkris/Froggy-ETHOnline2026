/**
 * How three agents connect by URL, with the URL filled in.
 *
 * Text, not a component, so a test can check the URL landed in each and the
 * card only has to lay them out.
 */

export const claudeCodeCommand = (mcpUrl: string): string =>
  `claude mcp add --transport http froggy ${mcpUrl}`;

export const cursorConfig = (mcpUrl: string): string =>
  JSON.stringify({ mcpServers: { froggy: { url: mcpUrl } } }, null, 2);

export const hermesNote = (mcpUrl: string): string =>
  `Add ${mcpUrl} as a remote MCP server in Hermes' config. On first use it opens a sign-in link; when the sandbox has no browser, Hermes relays the link to you and you paste the code back.`;
