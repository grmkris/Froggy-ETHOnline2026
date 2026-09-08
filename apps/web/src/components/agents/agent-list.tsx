/** OAuth grants and legacy tokens, each with a way to disconnect it. */

import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useMutation } from "@tanstack/react-query";
import { BotIcon } from "lucide-react";
import type { ReactElement } from "react";

import type { AgentToken, useAgentTokens } from "../../hooks/use-agent-tokens";

const when = (at: number): string => new Date(at).toLocaleString();

const AgentConnection = ({
  onRevoke,
  scopes,
  token,
}: {
  readonly onRevoke: (id: string) => Promise<void>;
  readonly scopes?: readonly string[];
  readonly token: AgentToken;
}): ReactElement => {
  const revoke = useMutation({
    mutationFn: async () => {
      await onRevoke(token.id);
    },
    retry: false,
  });
  const disconnectLabel = revoke.isError ? "Retry" : "Disconnect";
  return (
    <li className="bg-muted shadow-inset flex flex-col gap-2 rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium wrap-anywhere">{token.label}</h3>
          {scopes === undefined ? null : (
            <p className="text-muted-foreground mt-1 text-xs">
              Permissions: {scopes.join(", ")}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-xs">
            {token.lastUsedAt === null ? "Waiting for first use" : "Connected"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {token.lastUsedAt === null
              ? `Created ${when(token.createdAt)}`
              : `Last used ${when(token.lastUsedAt)}`}
          </p>
        </div>
        <Button
          aria-label={`${revoke.isError ? "Retry disconnecting" : "Disconnect"} ${token.label}`}
          className="min-h-11"
          disabled={revoke.isPending}
          onClick={() => {
            revoke.mutate();
          }}
          size="sm"
          variant="outline"
        >
          {revoke.isPending ? "Disconnecting…" : disconnectLabel}
        </Button>
      </div>
      {revoke.isError ? (
        <p className="text-refused text-xs" role="alert">
          Couldn’t confirm the disconnect. Try again or refresh status.
        </p>
      ) : null}
    </li>
  );
};

export const AgentList = ({
  agents,
  revoke,
}: Pick<
  ReturnType<typeof useAgentTokens>,
  "agents" | "revoke"
>): ReactElement => {
  const live = agents.data?.agents.filter((token) => token.revokedAt === null);
  const grants = agents.data?.grants.filter(
    (grant) => grant.revokedAt === null
  );
  const refreshLabel = agents.isError
    ? "Retry loading agents"
    : "Refresh status";
  return (
    <section aria-label="Your agents" className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section">Connected agents</h2>
        <Button
          className="min-h-11"
          disabled={agents.isFetching}
          onClick={() => {
            void agents.refetch();
          }}
          size="sm"
          variant="ghost"
        >
          {agents.isFetching ? "Refreshing…" : refreshLabel}
        </Button>
      </div>
      {agents.isPending ? (
        <output aria-label="Loading agents" className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <span className="sr-only">Loading agents</span>
        </output>
      ) : null}
      {agents.isError ? (
        <p className="text-refused text-xs" role="alert">
          Couldn’t load your agents. Retry to see their latest status.
        </p>
      ) : null}
      {live?.length === 0 && grants?.length === 0 && !agents.isError ? (
        <Empty className="flex-none py-[26px]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No connections yet.</EmptyTitle>
            <EmptyDescription>
              Connect your agent by URL to get started. Its access will appear
              here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {live === undefined || live.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {live.map((token) => (
            <AgentConnection key={token.id} onRevoke={revoke} token={token} />
          ))}
        </ul>
      )}
      {grants === undefined || grants.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {grants.map((grant) => (
            <AgentConnection
              key={grant.id}
              onRevoke={revoke}
              scopes={grant.scopes}
              token={{ ...grant, label: grant.clientName }}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
