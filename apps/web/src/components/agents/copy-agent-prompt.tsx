import { Skeleton } from "@froggy/ui/components/skeleton";
import type { ReactElement } from "react";

import { useAgentTokens } from "../../hooks/use-agent-tokens";
import { useWorkspace } from "../../lib/workspace-context";
import { CopyButton } from "../copy-button";

export const CopyAgentPrompt = (): ReactElement => {
  const { app } = useWorkspace();
  const origin =
    app.mcpUrl === null ? window.location.origin : new URL(app.mcpUrl).origin;
  const prompt = `Read ${origin}/llm.md and follow it to connect yourself to my Froggy wallet as an MCP server; then tell me what you can do.`;
  return (
    <CopyButton
      confirmation="Copied. Paste this into your agent’s chat."
      fallbackLabel="Instructions for your agent"
      label="Copy for your agent"
      text={prompt}
      variant="default"
    >
      Copy for your agent
    </CopyButton>
  );
};

export const AgentOnboarding = (): ReactElement => {
  const { agents } = useAgentTokens();
  const connected = [
    ...(agents.data?.agents ?? []),
    ...(agents.data?.grants ?? []),
  ].filter((agent) => agent.revokedAt === null);
  if (agents.isPending) {
    return (
      <Skeleton aria-label="Loading agent connections" className="h-11 w-40" />
    );
  }
  if (connected.length === 0) {
    return <CopyAgentPrompt />;
  }
  const [single] = connected;
  return (
    <a
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-lg px-2 text-sm outline-none focus-visible:ring-2"
      href={
        connected.length === 1 && single !== undefined
          ? `/agents/${single.id}`
          : "/agents"
      }
    >
      {connected.length} {connected.length === 1 ? "agent" : "agents"} connected
    </a>
  );
};
