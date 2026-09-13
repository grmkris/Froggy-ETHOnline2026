/** Who else may act on this wallet: an agent by URL, Telegram, email, sites, and the token path. */

import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import { useAgentTokens } from "../../hooks/use-agent-tokens";
import { useWorkspace } from "../../lib/workspace-context";
import { EmailAccount } from "../email/email-account";
import { DappConnections } from "../settings/dapp-connections";
import { AgentList } from "./agent-list";
import { AgentTokenSetup } from "./agent-token-setup";
import { ConnectTicket } from "./connect-ticket";
import { TelegramSettings } from "./telegram-settings";

export const ConnectionsTab = (): ReactElement => {
  const { app } = useWorkspace();
  const { agents, mint, revoke } = useAgentTokens();
  return (
    <div className="flex flex-col gap-8">
      <h2 className="sr-only">Connections</h2>
      <ConnectTicket />
      <AgentList agents={agents} revoke={revoke} />
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
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
      <EmailAccount />
      <DappConnections />
    </div>
  );
};
