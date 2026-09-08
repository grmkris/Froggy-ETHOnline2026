import { formatUsd } from "@froggy/domain";
import type { AgentInvocationView } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { DisconnectAgent } from "../components/agents/agent-list";
import { Page } from "../components/nav/page";
import { useAgentDetail, useAgentTokens } from "../hooks/use-agent-tokens";

const when = (at: number): string => new Date(at).toLocaleString();
const outcomeLabel = (outcome: string): string =>
  outcome === "started" ? "Outcome not recorded" : outcome.replaceAll("_", " ");

const InvocationRow = ({
  invocation,
}: {
  readonly invocation: AgentInvocationView;
}): ReactElement => (
  <li className="bg-muted shadow-inset flex flex-col gap-2 rounded-xl p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <span className="text-machine min-w-0 text-sm wrap-anywhere">
        {invocation.name}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{outcomeLabel(invocation.outcome)}</Badge>
        {invocation.stubbed ? <Badge variant="outline">Simulated</Badge> : null}
      </div>
    </div>
    <p className="text-muted-foreground text-xs">
      {invocation.kind === "mcp"
        ? "MCP tool"
        : `${invocation.kind === "pay" ? "Payment" : "Task"} request`}
      {" · "}
      <time dateTime={new Date(invocation.at).toISOString()}>
        {when(invocation.at)}
      </time>
    </p>
    {invocation.usdMicros === null ? null : (
      <p className="text-money text-sm">
        {formatUsd(invocation.usdMicros)}{" "}
        {invocation.outcome === "signed"
          ? "signed · settlement not confirmed"
          : "paid"}
      </p>
    )}
    {invocation.taskId === null ? null : (
      <p className="text-muted-foreground text-xs wrap-anywhere">
        Task
        {invocation.taskStatus === null
          ? ""
          : ` · ${invocation.taskStatus.replaceAll("_", " ")}`}
        :{" "}
        {invocation.taskKind === null ? (
          <span className="text-machine">{invocation.taskId}</span>
        ) : (
          <Link
            className="focus-visible:ring-ring rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2"
            to="/services"
            search={{ task: invocation.taskId }}
          >
            {invocation.taskId}
          </Link>
        )}
      </p>
    )}
  </li>
);

export const AgentDetailPage = (): ReactElement => {
  const { id } = useParams({ from: "/workspace/agents/$id" });
  const detail = useAgentDetail(id);
  const { revoke } = useAgentTokens();
  const agent = detail.data?.agent;
  return (
    <Page title={agent?.name ?? "Agent"}>
      <Link
        className="text-muted-foreground focus-visible:ring-ring inline-flex min-h-11 items-center self-start rounded-lg text-sm underline underline-offset-4 outline-none focus-visible:ring-2"
        to="/agents"
      >
        All agents
      </Link>
      {detail.isPending ? (
        <Skeleton aria-label="Loading agent" className="h-24 w-full" />
      ) : null}
      {detail.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert">{detail.error.message}</p>
          <Button
            onClick={() => {
              void detail.refetch();
            }}
            variant="outline"
          >
            Retry loading agent
          </Button>
        </div>
      ) : null}
      {agent === undefined ? null : (
        <>
          <section
            aria-label="Agent connection"
            className="bg-card shadow-card flex flex-col gap-4 rounded-2xl p-5"
          >
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Scopes</dt>
              <dd className="wrap-anywhere">
                {agent.scopes.join(", ") || "No scopes"}
              </dd>
              <dt className="text-muted-foreground">Connected since</dt>
              <dd>{when(agent.createdAt)}</dd>
              <dt className="text-muted-foreground">Last used</dt>
              <dd>
                {agent.lastUsedAt === null ? "Never" : when(agent.lastUsedAt)}
              </dd>
            </dl>
            {agent.revokedAt === null ? (
              <DisconnectAgent
                id={agent.id}
                name={agent.name}
                onRevoke={revoke}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Disconnected {when(agent.revokedAt)}. History is kept.
              </p>
            )}
          </section>
          <section
            aria-label="Invocation history"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section">Invocation history</h2>
              <Button
                disabled={detail.isFetching}
                onClick={() => {
                  void detail.refetch();
                }}
                size="sm"
                variant="ghost"
              >
                Refresh history
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Newest 50 calls and requests. Calls made before history was added
              are unavailable.
            </p>
            {detail.data?.invocations.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No invocations yet.</EmptyTitle>
                  <EmptyDescription>
                    This agent’s MCP calls and task or payment requests will
                    appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ol className="flex flex-col gap-2">
                {detail.data?.invocations.map((invocation) => (
                  <InvocationRow invocation={invocation} key={invocation.id} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </Page>
  );
};
