/** Who else may act on this wallet: an agent by URL, Telegram, and the token path. */

import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import { AgentList } from "../components/agents/agent-list";
import { AgentTokenSetup } from "../components/agents/agent-token-setup";
import { ConnectByUrlCard } from "../components/agents/connect-by-url-card";
import { TelegramSettings } from "../components/agents/telegram-settings";
import { Page } from "../components/nav/page";
import { useAgentTokens } from "../hooks/use-agent-tokens";
import { useWorkspace } from "../lib/workspace-context";

export const AgentsPage = (): ReactElement => {
  const { app } = useWorkspace();
  const { agents, mint, revoke } = useAgentTokens();
  return (
    <Page
      intro="Talk to Froggy from your phone, or let another agent request tasks on this wallet."
      title="Agents"
    >
      <ConnectByUrlCard mcpUrl={app.mcpUrl} />
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
      <details className="group rounded-2xl border px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-medium select-none">
          Advanced: connect with a token
          <ChevronDownIcon
            aria-hidden
            className="size-4 group-open:rotate-180"
          />
        </summary>
        <div className="pb-4">
          <AgentTokenSetup mint={mint} />
        </div>
      </details>
      <AgentList agents={agents} revoke={revoke} />
    </Page>
  );
};
