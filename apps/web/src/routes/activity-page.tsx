/**
 * One page for what the workspace did, who else may act in it, and what
 * each tool costs: Activity, Connections and Tools, as tabs on one route so
 * every deep link that ever pointed at a record keeps working.
 */

import { Tabs, TabsList, TabsTrigger } from "@froggy/ui/components/tabs";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Schema } from "effect";
import type { ReactElement } from "react";

import { ActivityFeed } from "../components/activity/activity-feed";
import { ConnectionsTab } from "../components/agents/connections-tab";
import { DiscardedSearchNotice } from "../components/discarded-search-notice";
import { Page } from "../components/nav/page";
import { ToolsTab } from "../components/tools/tools-tab";

const ActivityTab = Schema.Literals(["activity", "agents", "tools"]);
type ActivityTab = typeof ActivityTab.Type;

const INTRO: Record<ActivityTab, string> = {
  activity:
    "Requests, tool calls, results and payment evidence across your workspace.",
  agents:
    "Talk to Froggy from your phone, or let another agent request tasks on this wallet.",
  tools:
    "What Froggy can do, what each tool costs in credits, and what you have used.",
};

export const ActivityPage = (): ReactElement => {
  const search = useSearch({ from: "/workspace/activity" });
  const navigate = useNavigate();
  const tab: ActivityTab = search.tab ?? "activity";
  return (
    <Page intro={INTRO[tab]} title="Activity" wide>
      <DiscardedSearchNotice
        discarded={search.dropped === "1"}
        onDismiss={() => {
          void navigate({
            replace: true,
            search: () => {
              const { tab: kept, record } = search;
              if (kept !== undefined && record !== undefined) {
                return { tab: kept, record };
              }
              if (kept !== undefined) {
                return { tab: kept };
              }
              return record === undefined ? {} : { record };
            },
            to: "/activity",
          });
        }}
        what="The named record"
      />
      <Tabs
        onValueChange={(value: string) => {
          if (Schema.is(ActivityTab)(value)) {
            void navigate({
              to: "/activity",
              search: value === "activity" ? {} : { tab: value },
            });
          }
        }}
        value={tab}
      >
        <TabsList aria-label="Activity sections" className="w-full sm:w-fit">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="agents">Connections</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "activity" ? <ActivityFeed /> : null}
      {tab === "agents" ? <ConnectionsTab /> : null}
      {tab === "tools" ? <ToolsTab /> : null}
    </Page>
  );
};
