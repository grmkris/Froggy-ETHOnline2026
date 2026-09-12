/** Who else may act on this wallet: an agent by URL, Telegram, and the token path. */

import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import { AgentList } from "../components/agents/agent-list";
import { AgentTokenSetup } from "../components/agents/agent-token-setup";
import { CopyAgentPrompt } from "../components/agents/copy-agent-prompt";
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
      title="Connections"
    >
      <section
        aria-label="Connect your agent"
        className="flex flex-col items-start gap-3"
      >
        <p className="text-muted-foreground text-sm leading-relaxed">
          Paste these instructions into your agent’s chat.
          <br />
          It installs the skill and connects to Froggy; you approve access in
          your browser.
        </p>
        <CopyAgentPrompt />
      </section>
      <AgentList agents={agents} revoke={revoke} />
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
      <details className="group bg-muted shadow-inset rounded-2xl px-4">
        <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium outline-none select-none focus-visible:ring-2">
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
    </Page>
  );
};
