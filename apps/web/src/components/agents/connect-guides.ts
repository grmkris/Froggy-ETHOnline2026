/**
 * How to connect each client, step by step, with every value copyable.
 *
 * One list per client rather than one generic list, because the words on
 * the screen differ: ChatGPT calls it a connector and needs developer mode,
 * Claude Desktop calls it a custom connector, Claude Code takes a command.
 * Screenshots are optional files the owner drops in; a missing one shows
 * nothing rather than a broken image.
 */

export interface GuideStep {
  readonly text: string;
  /** Something to paste: a URL, a command, a JSON snippet. */
  readonly value?: string;
  readonly multiline?: boolean;
}

export interface ClientGuide {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly steps: (origin: string) => readonly GuideStep[];
}

export const CLIENT_GUIDES: readonly ClientGuide[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    note: "Needs developer mode, which ChatGPT keeps under Settings › Apps & Connectors › Advanced.",
    steps: (origin) => [
      {
        text: "In ChatGPT, open Settings › Apps & Connectors and turn on Developer mode under Advanced.",
      },
      {
        text: "Choose Create, name the connector Froggy, and paste the MCP server URL.",
        value: `${origin}/mcp`,
      },
      {
        text: "Pick OAuth for authentication and save. Froggy's consent page opens: sign in, tick what the agent may do, and choose Allow.",
      },
      {
        text: "In a new chat, open the plus menu, choose Froggy under Apps, and ask it what it can do.",
      },
    ],
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    note: "Also the path for Claude on the web; the connector appears in every chat once it is on.",
    steps: (origin) => [
      { text: "Open Settings › Connectors and choose Add custom connector." },
      {
        text: "Name it Froggy and paste the MCP server URL.",
        value: `${origin}/mcp`,
      },
      {
        text: "Choose Connect. Froggy's consent page opens in your browser: sign in, tick what the agent may do, and choose Allow.",
      },
      {
        text: "In a new chat, open the tools menu, check Froggy is on, and ask it what it can do.",
      },
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    note: "One command in a terminal, then sign in from inside the session.",
    steps: (origin) => [
      {
        text: "Add Froggy as an MCP server.",
        value: `claude mcp add --transport http froggy ${origin}/mcp`,
      },
      {
        text: "Inside Claude Code, run the MCP command and choose Authenticate next to froggy. Approve access in the browser tab that opens.",
        value: "/mcp",
      },
      {
        text: "Optional: save the skill so the agent knows Froggy's rules before it starts.",
        value: `mkdir -p ~/.claude/skills/froggy && curl -fsSL ${origin}/skill.md -o ~/.claude/skills/froggy/SKILL.md`,
      },
      { text: "Ask it what Froggy can do." },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    note: "Cursor reads MCP servers from a JSON file in the project or your home folder.",
    steps: (origin) => [
      {
        text: "Open Cursor Settings › MCP and choose Add new MCP server, or merge this into .cursor/mcp.json.",
        value: JSON.stringify(
          { mcpServers: { froggy: { url: `${origin}/mcp` } } },
          null,
          2
        ),
        multiline: true,
      },
      {
        text: "Turn the server on and choose Authenticate. Approve access in the browser.",
      },
      { text: "Ask the agent what Froggy can do." },
    ],
  },
  {
    id: "other",
    label: "Any MCP client",
    note: "Streamable HTTP with OAuth; the client registers itself, nothing is pasted but the URL.",
    steps: (origin) => [
      {
        text: "Point the client at the MCP server URL and let it sign in through your browser.",
        value: `${origin}/mcp`,
      },
      {
        text: "Or paste the one-line instructions above into its chat; they send it to llm.md, which explains the rest.",
        value: `${origin}/llm.md`,
      },
      {
        text: "If it has no browser to sign in with, mint a token under Advanced below and hand it that instead.",
      },
    ],
  },
];
