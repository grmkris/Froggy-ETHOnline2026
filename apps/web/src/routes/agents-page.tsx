/** Who else may act on this wallet: Telegram, and the agents connected to it. */

import type { ReactElement } from "react";

import { AgentSettings } from "../components/agents/agent-settings";
import { TelegramSettings } from "../components/agents/telegram-settings";
import { Page } from "../components/nav/page";
import { useWorkspace } from "../lib/workspace-context";

export const AgentsPage = (): ReactElement => {
  const { app } = useWorkspace();
  return (
    <Page
      intro="Talk to Froggy from your phone, or let another agent request tasks on this wallet."
      title="Agents"
    >
      <TelegramSettings active configured={app.modes?.telegram === "live"} />
      <AgentSettings />
    </Page>
  );
};
