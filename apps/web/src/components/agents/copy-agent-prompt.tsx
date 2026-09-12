import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useAgentTokens } from "../../hooks/use-agent-tokens";
import { useWorkspace } from "../../lib/workspace-context";
import { CopyButton } from "../copy-button";

const CopyAgentPrompt = (): ReactElement => {
  const { app } = useWorkspace();
  const origin =
    app.mcpUrl === null ? window.location.origin : new URL(app.mcpUrl).origin;
  const prompt = `Read ${origin}/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do.`;
  return (
    <CopyButton
      confirmation="Copied. Paste this into your agent’s chat."
      fallbackLabel="Instructions for your agent"
      hint="Paste into your agent’s chat, then approve access in your browser."
      label="Copy for your agent"
      text={prompt}
      variant="default"
    >
      Copy for your agent
    </CopyButton>
  );
};

const ConnectionStatus = (): ReactElement => {
  const { agents } = useAgentTokens();
  const connected = [
    ...(agents.data?.agents ?? []),
    ...(agents.data?.grants ?? []),
  ].filter((agent) => agent.revokedAt === null);
  if (agents.isPending) {
    return (
      <output
        aria-label="Loading agent connections"
        className="flex min-h-8 items-center"
      >
        <Skeleton aria-hidden className="h-4 w-40" />
        <span className="sr-only">Loading agent connections</span>
      </output>
    );
  }
  if (agents.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <output className="text-muted-foreground">
          Connection status unavailable.
        </output>
        <Button
          disabled={agents.isFetching}
          onClick={() => {
            void agents.refetch();
          }}
          size="sm"
          variant="ghost"
        >
          {agents.isFetching ? "Checking…" : "Retry connection status"}
        </Button>
      </div>
    );
  }
  if (connected.length === 0) {
    return (
      <p className="text-muted-foreground flex min-h-8 items-center text-xs">
        No agent connected yet.
      </p>
    );
  }
  const [single] = connected;
  return (
    <Link
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-8 items-center rounded-lg text-xs outline-none focus-visible:ring-2"
      to={
        connected.length === 1 && single !== undefined
          ? "/agents/$id"
          : "/agents"
      }
      params={{ id: single?.id ?? "" }}
    >
      {connected.length} {connected.length === 1 ? "agent" : "agents"} connected
    </Link>
  );
};

export const AgentOnboarding = (): ReactElement => (
  <section
    aria-label="Connect your agent"
    className="flex max-w-sm flex-col items-start gap-2"
  >
    <CopyAgentPrompt />
    <ConnectionStatus />
  </section>
);
