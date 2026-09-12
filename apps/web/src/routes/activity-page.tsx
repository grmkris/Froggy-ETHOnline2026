import { formatUsd } from "@froggy/domain";
import type {
  HistoryExecution,
  HistoryId,
  HistoryRecord,
} from "@froggy/domain";
import type { HistoryBusiness } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@froggy/ui/components/sheet";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowLeftIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { ReceiptTicket } from "../components/cards/receipt-ticket";
import { DiscardedSearchNotice } from "../components/discarded-search-notice";
import { Page } from "../components/nav/page";
import { MarkdownText } from "../components/stream/markdown-text";
import { useAgentTokens } from "../hooks/use-agent-tokens";
import { useMediaQuery } from "../hooks/use-media-query";
import { useChatSurface } from "../lib/chat-context";
import {
  useHistoryDetail,
  useHistoryPage,
  useHistoryStale,
} from "../lib/history-client";
import { useWorkspace } from "../lib/workspace-context";

const titleOf = (record: HistoryRecord): string => {
  switch (record.kind) {
    case "conversation": {
      return record.title;
    }
    case "execution": {
      return record.name.replaceAll("_", " ");
    }
    case "run": {
      return "Conversation run";
    }
    case "message": {
      return record.role === "user" ? "Request" : "Answer";
    }
    case "artifact": {
      return record.title;
    }
  }
  throw new Error("Unsupported history record.");
};
const statusOf = (record: HistoryRecord): string =>
  "status" in record ? record.status : "saved";
const RecordLink = ({
  record,
}: {
  readonly record: HistoryRecord;
}): ReactElement => (
  <Link
    className="hover:bg-muted focus-visible:ring-ring flex flex-col gap-2 rounded-xl p-4 outline-none focus-visible:ring-2"
    search={{ record: record.id }}
    to="/activity"
  >
    <span className="flex flex-wrap justify-between gap-2">
      <span className="font-medium">{titleOf(record)}</span>
      <Badge variant="secondary">{statusOf(record)}</Badge>
    </span>
    {record.kind === "execution" ? (
      <p className="text-muted-foreground line-clamp-2 text-sm">
        {record.result || record.input || "Historical call body unavailable"}
      </p>
    ) : null}
    <span className="text-muted-foreground text-xs">
      {record.source} ·{" "}
      <time dateTime={new Date(record.createdAt).toISOString()}>
        {new Date(record.createdAt).toLocaleString()}
      </time>
      {record.kind === "execution" && record.finishedAt !== null
        ? ` · ${((record.finishedAt - record.createdAt) / 1000).toFixed(1)} s`
        : ""}
    </span>
  </Link>
);
const ActivityRows = ({ path }: { readonly path: string }): ReactElement => {
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors.at(-1);
  const page = useHistoryPage(
    before === undefined ? path : `${path}&before=${encodeURIComponent(before)}`
  );
  if (page.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (page.isError) {
    return (
      <p role="alert">
        Activity could not be loaded.{" "}
        <Button
          onClick={() => {
            void page.refetch();
          }}
          variant="outline"
        >
          Retry
        </Button>
      </p>
    );
  }
  const polls = page.records.filter(
    (record) =>
      record.kind === "execution" && /(?:status|list)$/u.test(record.name)
  );
  const primary = page.records.filter(
    (record) =>
      !polls.includes(record) &&
      !(record.kind === "execution" && record.runId !== null)
  );
  return (
    <>
      {page.records.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">
          No activity matches these filters.
        </p>
      ) : null}
      <ul className="divide-border divide-y">
        {primary.map((record) => (
          <li key={record.id}>
            <RecordLink record={record} />
          </li>
        ))}
      </ul>
      {polls.length > 0 ? (
        <details className="bg-muted rounded-xl p-3">
          <summary className="cursor-pointer text-sm">
            Status and list checks ({polls.length})
          </summary>
          <p className="text-muted-foreground my-2 text-xs">
            Checks are recorded individually. They are not additional payment
            receipts.
          </p>
          <ul>
            {polls.map((record) => (
              <li key={record.id}>
                <RecordLink record={record} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {cursors.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setCursors((current) => current.slice(0, -1));
            }}
          >
            Newer activity
          </Button>
        ) : null}
        {page.cursor === null ? null : (
          <Button
            variant="ghost"
            onClick={() => {
              const next = page.cursor;
              if (next !== null) {
                setCursors((current) => [...current, next]);
              }
            }}
          >
            Older activity
          </Button>
        )}
      </div>
    </>
  );
};
const Artifact = ({ id }: { readonly id: HistoryId }): ReactElement => {
  const detail = useHistoryDetail(id);
  if (detail.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (detail.isError) {
    return (
      <p role="alert">
        Result unavailable.{" "}
        <Button
          onClick={() => {
            void detail.refetch();
          }}
          size="sm"
          variant="ghost"
        >
          Retry
        </Button>
      </p>
    );
  }
  const { record } = detail.data;
  return record.kind === "artifact" ? (
    <div className="flex flex-col gap-2">
      <pre className="bg-muted max-h-96 overflow-auto rounded-xl p-3 text-xs wrap-anywhere whitespace-pre-wrap">
        {record.content}
      </pre>
      {record.truncated ? (
        <Badge variant="outline">Result truncated</Badge>
      ) : null}
      {record.sourceUrl === null ? null : (
        <a href={record.sourceUrl} rel="noreferrer" target="_blank">
          Open source
        </a>
      )}
    </div>
  ) : (
    <p>Result unavailable.</p>
  );
};
const TextPart = Schema.decodeUnknownResult(
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
);
const messageText = (record: HistoryRecord): string =>
  record.kind === "message"
    ? record.parts
        .flatMap((part) => {
          const decoded = TextPart(part);
          return decoded._tag === "Success" ? [decoded.success.text] : [];
        })
        .join("\n")
    : "";
const MessageEvidence = ({
  record,
}: {
  readonly record: HistoryRecord;
}): ReactElement => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-medium">{titleOf(record)}</h3>
    <MarkdownText
      live={false}
      text={
        messageText(record) ||
        "No text answer was recorded. Inspect the tool calls below."
      }
    />
    {record.kind === "message" ? (
      <p className="text-muted-foreground text-xs">
        Delivery: {record.delivery}
        {record.recovered ? " · Recovered from Telegram cache" : ""}
        {record.truncated ? " · Truncated" : ""}
      </p>
    ) : null}
  </section>
);
const BusinessEvidence = ({
  records,
}: {
  readonly records: readonly HistoryBusiness[];
}): ReactElement => (
  <section className="flex flex-col gap-3">
    {records.map((record) => (
      <div
        className="bg-muted flex flex-col gap-2 rounded-xl p-3"
        key={record.id}
      >
        <h3 className="text-sm font-medium">
          {record.kind === "purchase" ? "URL purchase" : "Service task"} ·{" "}
          {record.status.replaceAll("_", " ")}
        </h3>
        <p className="text-sm">
          Payment: {record.payment ?? "See the task’s sale record"} · Delivery:{" "}
          {record.delivery}
        </p>
        {record.quotedUsdMicros === null ? null : (
          <p className="text-muted-foreground text-xs">
            Quoted price: {formatUsd(record.quotedUsdMicros)}
          </p>
        )}
        {record.approval === null ? null : (
          <p className="text-muted-foreground text-xs">
            Approval: {record.approval.status} · expires{" "}
            {new Date(record.approval.expiresAt).toLocaleString()}
          </p>
        )}
        {record.error === null ? null : (
          <p className="text-sm">{record.error}</p>
        )}
        {record.kind === "task" ? (
          <a className="text-sm underline" href={`/services?task=${record.id}`}>
            View task and sale
          </a>
        ) : null}
      </div>
    ))}
  </section>
);
const ExecutionEvidence = ({
  record,
}: {
  readonly record: HistoryExecution;
}): ReactElement => {
  const [inspect, setInspect] = useState(false);
  return (
    <>
      <section>
        <h3 className="mb-2 text-sm font-medium">Recorded input</h3>
        <pre className="bg-muted max-h-64 overflow-auto rounded-xl p-3 text-xs wrap-anywhere whitespace-pre-wrap">
          {record.input || "Historical arguments unavailable"}
        </pre>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium">
          Outcome: {record.outcome.replaceAll("_", " ")}
        </h3>
        <pre className="bg-muted max-h-64 overflow-auto rounded-xl p-3 text-xs wrap-anywhere whitespace-pre-wrap">
          {record.result || "Result body unavailable"}
        </pre>
      </section>
      <div className="flex flex-wrap gap-2">
        {record.truncated ? (
          <Badge variant="outline">Preview truncated</Badge>
        ) : null}
        {record.redacted ? (
          <Badge variant="outline">Credentials removed</Badge>
        ) : null}
      </div>
      {record.taskId === null ? null : (
        <Link
          className="text-sm underline"
          search={{ task: record.taskId }}
          to="/services"
        >
          View task
        </Link>
      )}
      {record.purchaseId === null ? null : (
        <p className="text-muted-foreground text-xs wrap-anywhere">
          Purchase: {record.purchaseId}
        </p>
      )}
      {record.artifactIds.length > 0 ? (
        <Button
          onClick={() => {
            setInspect(!inspect);
          }}
          size="sm"
          variant="outline"
        >
          {inspect ? "Hide recorded result" : "Inspect recorded result"}
        </Button>
      ) : null}
      {inspect
        ? record.artifactIds.map((artifactId) => (
            <Artifact id={artifactId} key={artifactId} />
          ))
        : null}
    </>
  );
};

const Evidence = ({ id }: { readonly id: HistoryId }): ReactElement => {
  const detail = useHistoryDetail(id);
  const [copied, setCopied] = useState(false);
  const { send, busy, historyLoading } = useChatSurface();
  if (detail.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (detail.isError) {
    return (
      <p role="alert">
        This record could not be loaded.{" "}
        <Button
          onClick={() => {
            void detail.refetch();
          }}
          variant="outline"
        >
          Retry
        </Button>
      </p>
    );
  }
  const { record, related, receipts, business } = detail.data;
  const conversationId =
    "conversationId" in record ? record.conversationId : null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-medium">{titleOf(record)}</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {record.source} · {new Date(record.createdAt).toLocaleString()}
        </p>
        <Badge className="mt-3" variant="secondary">
          {statusOf(record)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {conversationId === null ? null : (
          <Button
            nativeButton={false}
            render={
              <Link params={{ conversationId }} to="/chat/$conversationId" />
            }
            size="sm"
            variant="outline"
          >
            Open conversation
          </Button>
        )}
        <Button
          disabled={busy || historyLoading}
          onClick={() => {
            send(
              `Explain what happened in history record ${id}. Use history_search to read it and cite the recorded evidence. Distinguish payment from delivery; do not repeat any operation.`,
              true
            );
          }}
          size="sm"
          variant="outline"
        >
          Explain this run
        </Button>
        <Button
          onClick={() => {
            const copy = async (): Promise<void> => {
              await navigator.clipboard.writeText(
                `Froggy activity ${id}\n${globalThis.location.origin}/activity?record=${id}`
              );
              setCopied(true);
            };
            void copy();
          }}
          size="sm"
          variant="ghost"
        >
          <CopyIcon data-icon="inline-start" />
          {copied ? "Copied" : "Copy for agent"}
        </Button>
      </div>
      <BusinessEvidence records={business} />
      {record.kind === "message" ? <MessageEvidence record={record} /> : null}
      {record.kind === "artifact" ? <Artifact id={record.id} /> : null}
      {record.kind === "run" && record.error !== null ? (
        <output className="text-sm">{record.error}</output>
      ) : null}
      {record.kind === "run" && record.waits.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Approvals</h3>
          {record.waits.map((wait) => (
            <div className="bg-muted rounded-xl p-3 text-sm" key={wait.id}>
              <p>
                {wait.resolution ?? "Awaiting answer"} · expires{" "}
                {new Date(wait.expiresAt).toLocaleString()}
              </p>
              <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(wait.request, null, 2)}
              </pre>
            </div>
          ))}
        </section>
      ) : null}
      {record.kind === "execution" ? (
        <ExecutionEvidence record={record} />
      ) : null}
      {related
        .filter((item) => item.kind === "message")
        .toSorted(
          (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
        )
        .map((item) => (
          <MessageEvidence key={item.id} record={item} />
        ))}
      {related.some((item) => item.kind === "execution") ? (
        <section>
          <h3 className="mb-2 font-medium">Tool calls</h3>
          <ul>
            {related
              .filter((item) => item.kind === "execution")
              .toSorted((a, b) => a.createdAt - b.createdAt)
              .map((item) => (
                <li key={item.id}>
                  <RecordLink record={item} />
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Payment evidence</h3>
        {receipts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No receipt is linked to this record. A completed call alone does not
            confirm payment.
          </p>
        ) : (
          receipts.map((receipt) => (
            <ReceiptTicket key={receipt.id} receipt={receipt} />
          ))
        )}
      </section>
    </div>
  );
};
export const ActivityPage = (): ReactElement => {
  const stale = useHistoryStale();
  const { dropped, record } = useSearch({ from: "/workspace/activity" });
  const navigate = useNavigate();
  const phone = useMediaQuery("(max-width: 767px)");
  const { app } = useWorkspace();
  const { agents } = useAgentTokens();
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [connection, setConnection] = useState("");
  const [since, setSince] = useState("");
  const close = () => {
    void navigate({ to: "/activity", search: {} });
  };
  const path = `/api/activity?limit=30&source=${source}&status=${status}&connectionId=${encodeURIComponent(connection)}&since=${since === "" ? "" : new Date(since).getTime()}`;
  return (
    <Page
      intro="Requests, tool calls, results and payment evidence across your workspace."
      title="Activity"
      wide
    >
      <DiscardedSearchNotice
        discarded={dropped === "1"}
        onDismiss={() => {
          void navigate({
            replace: true,
            search: () => (record === undefined ? {} : { record }),
            to: "/activity",
          });
        }}
        what="The named record"
      />
      {app.connected && !stale ? null : (
        <output className="text-muted-foreground text-sm">
          Updates are delayed. Showing the last saved snapshot.
        </output>
      )}
      <FieldGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="activity-source">Source</FieldLabel>
          <NativeSelect
            id="activity-source"
            onChange={(event) => {
              setSource(event.target.value);
            }}
            value={source}
          >
            <NativeSelectOption value="">All sources</NativeSelectOption>
            {["web", "telegram", "agent", "schedule"].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="activity-status">Status</FieldLabel>
          <NativeSelect
            id="activity-status"
            onChange={(event) => {
              setStatus(event.target.value);
            }}
            value={status}
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {[
              "completed",
              "waiting",
              "running",
              "failed",
              "interrupted",
              "uncertain",
              "stopped",
            ].map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="activity-connection">Connection</FieldLabel>
          <NativeSelect
            id="activity-connection"
            onChange={(event) => {
              setConnection(event.target.value);
            }}
            value={connection}
          >
            <NativeSelectOption value="">All connections</NativeSelectOption>
            {agents.data?.agents.map((agent) => (
              <NativeSelectOption key={agent.id} value={agent.id}>
                {agent.label}
              </NativeSelectOption>
            ))}
            {agents.data?.grants.map((grant) => (
              <NativeSelectOption key={grant.id} value={grant.id}>
                {grant.clientName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="activity-since">Since</FieldLabel>
          <Input
            id="activity-since"
            onChange={(event) => {
              setSince(event.target.value);
            }}
            type="date"
            value={since}
          />
        </Field>
      </FieldGroup>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={record === undefined ? "md:col-span-2" : undefined}>
          <ActivityRows key={path} path={path} />
        </section>
        {record !== undefined && !phone ? (
          <aside className="bg-card border-border sticky top-0 rounded-2xl border p-5">
            <Button className="mb-4" onClick={close} size="sm" variant="ghost">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to activity
            </Button>
            <Evidence id={record} key={record} />
          </aside>
        ) : null}
      </div>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
        open={phone && record !== undefined}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-none"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>Activity details</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 p-4">
            <Button onClick={close} variant="ghost">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to activity
            </Button>
            {record === undefined ? null : (
              <Evidence id={record} key={record} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Page>
  );
};
