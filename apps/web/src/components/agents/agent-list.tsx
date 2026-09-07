/** The agents connected with a token, and the one button that disconnects each. */

import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useMutation } from "@tanstack/react-query";
import type { ReactElement } from "react";

import type { AgentToken, useAgentTokens } from "../../hooks/use-agent-tokens";

const when = (at: number): string => new Date(at).toLocaleString();

const AgentConnection = ({
  onRevoke,
  token,
}: {
  readonly onRevoke: (id: string) => Promise<void>;
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
    <li className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium wrap-anywhere">{token.label}</h3>
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
  const refreshLabel = agents.isError
    ? "Retry loading agents"
    : "Refresh status";
  return (
    <section aria-label="Your agents" className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Connected agents</h2>
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
      {live?.length === 0 && !agents.isError ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4">
          No connections yet. Create one above, or use Froggy in this workspace.
        </p>
      ) : null}
      {live === undefined || live.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {live.map((token) => (
            <AgentConnection key={token.id} onRevoke={revoke} token={token} />
          ))}
        </ul>
      )}
    </section>
  );
};
