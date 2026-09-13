import type { ConversationId } from "@froggy/domain";
import { BrowseBudget, BrowseTaskResponse } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useCredits } from "../../hooks/use-credits";
import { useChatSurface } from "../../lib/chat-context";
import { formatCredits } from "../../lib/credit-view";
import { useSessionToken } from "../../lib/session-token";
import { useWorkspace } from "../../lib/workspace-context";
import { BrowseTaskCard } from "./browse-task-card";

const BUDGETS: readonly BrowseBudget[] = [1, 3, 5];
type Task = (typeof BrowseTaskResponse.Type)["task"];
type GetToken = () => Promise<string | null>;
const ErrorResponse = Schema.Struct({ error: Schema.String });
const TaskList = Schema.Struct({
  v: Schema.Literal(1),
  tasks: Schema.Array(BrowseTaskResponse.fields.task),
});
interface BrowseRequest {
  readonly v: 2;
  readonly conversationId: ConversationId;
  readonly kind: "browse";
  readonly instruction: string;
  readonly budgetUsd: BrowseBudget;
  readonly idempotencyKey: string;
}
const request = async (
  getToken: GetToken,
  path: string,
  body?: BrowseRequest
): Promise<Schema.Json> => {
  const token = await getToken();
  const init: RequestInit = {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token ?? ""}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = Schema.decodeUnknownResult(ErrorResponse)(value);
    throw new Error(
      error._tag === "Success"
        ? error.success.error
        : "The task could not be confirmed. Check its status before retrying."
    );
  }
  return Schema.decodeUnknownSync(Schema.Json)(value);
};
const savedTask = async (
  getToken: GetToken,
  key: string
): Promise<Task | null> => {
  const list = Schema.decodeUnknownSync(TaskList)(
    await request(
      getToken,
      `/api/tasks?idempotencyKey=${encodeURIComponent(key)}`
    )
  );
  return list.tasks[0] ?? null;
};

export const BrowseTaskForm = ({
  instruction,
  requestKey,
}: {
  readonly instruction: string;
  readonly requestKey: string;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const { conversationId } = useChatSurface();
  const { app } = useWorkspace();
  const credits = useCredits();
  const { sessionId, dispatch } = app;
  const [budget, setBudget] = useState<BrowseBudget>(1);
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const cap = credits.summary.data?.limits.perTaskUnits;
  const available = credits.summary.data?.availableUnits;
  const payable = (candidate: BrowseBudget) =>
    cap !== undefined &&
    available !== undefined &&
    candidate * 1_000_000 <= Math.min(cap, available);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await savedTask(getToken, requestKey);
        if (active && saved !== null) {
          setTask(saved);
        }
      } catch {
        /* The same idempotency key remains attached to this task. */
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken, requestKey]);
  const current =
    app.browseTasks.find(
      (item) => item.id === task?.id || item.requestKey === requestKey
    ) ?? task;
  const taskId = current?.id;
  const status = current?.status;
  useEffect(() => {
    if (
      taskId === undefined ||
      ["done", "failed", "cancelled"].includes(status ?? "")
    ) {
      return () => {
        /* Finished tasks need no poll cleanup. */
      };
    }
    let active = true;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const value = await request(getToken, `/api/tasks/${taskId}`);
          const updated =
            Schema.decodeUnknownSync(BrowseTaskResponse)(value).task;
          if (active) {
            setTask(updated);
            if (sessionId !== null) {
              dispatch({
                type: "browse.snapshot",
                sessionId,
                tasks: [updated],
              });
            }
          }
        } catch {
          /* Retain the task while the connection recovers. */
        }
      })();
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [dispatch, getToken, sessionId, status, taskId]);
  const start = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const value = await request(getToken, "/api/tasks", {
        v: 2,
        kind: "browse",
        conversationId,
        instruction,
        budgetUsd: budget,
        idempotencyKey: requestKey,
      });
      const result = Schema.decodeUnknownSync(BrowseTaskResponse)(value).task;
      setTask(result);
      if (sessionId !== null) {
        dispatch({ type: "browse.snapshot", sessionId, tasks: [result] });
      }
      await credits.refresh();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not confirm this task. Keep the same request before retrying."
      );
      const saved = await savedTask(getToken, requestKey).catch(() => null);
      if (saved) {
        setTask(saved);
      }
    }
    setBusy(false);
  };
  if (current) {
    return <BrowseTaskCard task={current} />;
  }
  return (
    <FieldGroup className="border-border bg-card rounded-2xl border p-4">
      <p className="text-sm font-medium">{instruction}</p>
      <Field>
        <FieldLabel>Browsing budget</FieldLabel>
        <ToggleGroup
          aria-label="Browsing budget"
          disabled={busy}
          value={[String(budget)]}
          onValueChange={(values) => {
            const parsed = Schema.decodeUnknownResult(BrowseBudget)(
              Number(values[0])
            );
            if (parsed._tag === "Success") {
              setBudget(parsed.success);
            }
          }}
          variant="outline"
          size="sm"
        >
          {BUDGETS.map((candidate) => (
            <ToggleGroupItem
              disabled={!payable(candidate)}
              key={candidate}
              value={String(candidate)}
            >
              {candidate * 100} credits
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          Credits are held for this task and used when the result is saved.
          Failed or canceled work returns credits after its outcome is known.
          Website purchases use your wallet separately.
        </FieldDescription>
      </Field>
      <p className="text-muted-foreground text-xs">
        {available === undefined
          ? "Loading credits…"
          : `${formatCredits(available)} available.`}{" "}
        {cap === undefined ? "" : `${formatCredits(cap)} per-task limit.`}{" "}
        <Link className="underline underline-offset-2" to="/wallet">
          Buy credits or adjust limits.
        </Link>
      </p>
      <Button
        disabled={busy || !payable(budget)}
        onClick={() => {
          void start();
        }}
        size="sm"
      >
        {busy ? "Starting task…" : `Browse · ${budget * 100} credits`}
      </Button>
      {failure === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {failure}
        </p>
      )}
    </FieldGroup>
  );
};
