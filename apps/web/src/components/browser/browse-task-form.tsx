import { TaskId, TaskStatus } from "@froggy/domain";
import {
  BrowseBudget,
  BrowseChallenge,
  BrowseQuoteResponse,
} from "@froggy/protocol";
import type { BrowseQuote } from "@froggy/protocol";
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
import { Schema } from "effect";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useChatSurface } from "../../lib/chat-context";
import { useSessionToken } from "../../lib/session-token";

const TaskResponse = Schema.Struct({
  v: Schema.Literals([1]),
  task: Schema.Struct({
    id: TaskId,
    status: TaskStatus,
    error: Schema.NullOr(Schema.String),
    result: Schema.Unknown,
  }),
});
type Task = (typeof TaskResponse.Type)["task"];
const Signed = Schema.Struct({
  v: Schema.Literals([1]),
  header: Schema.String,
});
const ErrorResponse = Schema.Struct({ error: Schema.String });
const ResultText = Schema.Struct({ text: Schema.String });
type GetToken = () => Promise<string | null>;
interface BrowseRequest {
  readonly kind: "browse";
  readonly instruction: string;
  readonly budgetUsd: BrowseBudget;
  readonly idempotencyKey: string;
  readonly quoteTaskId?: TaskId;
}
interface PaymentRequest {
  readonly challenge: BrowseChallenge;
  readonly quoteTaskId: TaskId;
}
const request = async (
  getToken: GetToken,
  path: string,
  body?: BrowseRequest | PaymentRequest,
  payment?: string
): Promise<Response> => {
  const token = await getToken();
  const headers = new Headers({
    authorization: `Bearer ${token ?? ""}`,
    "content-type": "application/json",
  });
  if (payment !== undefined) {
    headers.set("payment-signature", payment);
  }
  const init: RequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers,
    cache: "no-store",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return await fetch(path, init);
};
const fail = async (response: Response): Promise<never> => {
  const parsed = Schema.decodeUnknownResult(ErrorResponse)(
    await response.json()
  );
  throw new Error(
    parsed._tag === "Success"
      ? parsed.success.error.slice(0, 1000)
      : "The task could not be confirmed. Check its status before retrying."
  );
};
const fetchTask = async (
  getToken: GetToken,
  id: TaskId
): Promise<Task | null> => {
  try {
    const response = await request(getToken, `/api/tasks/${id}`);
    if (!response.ok) {
      return null;
    }
    return Schema.decodeUnknownSync(TaskResponse)(await response.json()).task;
  } catch {
    return null;
  }
};
const fetchSavedTask = async (
  getToken: GetToken,
  key: string
): Promise<Task | null> => {
  try {
    const response = await request(
      getToken,
      `/api/tasks?idempotencyKey=${encodeURIComponent(key)}`
    );
    if (!response.ok) {
      return null;
    }
    const list = Schema.decodeUnknownSync(
      Schema.Struct({
        v: Schema.Literals([1]),
        tasks: Schema.Array(TaskResponse.fields.task),
      })
    )(await response.json());
    const [task] = list.tasks;
    return task !== undefined && task.status !== "quoted" ? task : null;
  } catch {
    return null;
  }
};

type QuoteResult =
  | {
      readonly kind: "quote";
      readonly quote: BrowseQuote;
      readonly challenge: BrowseChallenge;
    }
  | { readonly kind: "task"; readonly task: Task }
  | { readonly kind: "error"; readonly error: string };
const fetchQuote = async (
  getToken: GetToken,
  input: BrowseRequest
): Promise<QuoteResult> => {
  try {
    const response = await request(getToken, "/api/tasks", input);
    if (response.status === 402) {
      const raw: unknown = await response.json();
      const parsed = Schema.decodeUnknownResult(BrowseQuoteResponse)(raw);
      if (parsed._tag === "Failure") {
        const error = Schema.decodeUnknownResult(ErrorResponse)(raw);
        return {
          kind: "error",
          error:
            error._tag === "Success"
              ? error.success.error
              : "Quote unavailable.",
        };
      }
      return {
        kind: "quote",
        quote: parsed.success.quote,
        challenge: Schema.decodeUnknownSync(BrowseChallenge)(raw),
      };
    }
    if (!response.ok) {
      return await fail(response);
    }
    return {
      kind: "task",
      task: Schema.decodeUnknownSync(TaskResponse)(await response.json()).task,
    };
  } catch (error) {
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "Quote unavailable.",
    };
  }
};
interface PurchaseResult {
  readonly task: Task;
  readonly error: string | null;
}
const purchaseTask = async (
  getToken: GetToken,
  quote: BrowseQuote,
  challenge: BrowseChallenge
): Promise<PurchaseResult> => {
  try {
    const signed = await request(getToken, "/api/wallet/pay", {
      challenge,
      quoteTaskId: quote.taskId,
    });
    if (!signed.ok) {
      return await fail(signed);
    }
    const { header } = Schema.decodeUnknownSync(Signed)(await signed.json());
    const response = await request(
      getToken,
      "/api/tasks",
      {
        kind: "browse",
        instruction: quote.instruction,
        budgetUsd: quote.budgetUsd,
        idempotencyKey: quote.idempotencyKey,
        quoteTaskId: quote.taskId,
      },
      header
    );
    if (!response.ok) {
      return await fail(response);
    }
    return {
      task: Schema.decodeUnknownSync(TaskResponse)(await response.json()).task,
      error: null,
    };
  } catch (error) {
    const task = await fetchTask(getToken, quote.taskId);
    return {
      task: task ?? {
        id: quote.taskId,
        status: "uncertain",
        error:
          "Payment outcome is unknown. Retrieve this task before retrying.",
        result: null,
      },
      error:
        error instanceof Error
          ? error.message
          : "Payment could not be confirmed.",
    };
  }
};

export const BrowseTaskForm = ({
  instruction,
  requestKey,
}: {
  readonly instruction: string;
  readonly requestKey: string;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const { showBrowser } = useChatSurface();
  const [budget, setBudget] = useState<BrowseBudget>(1);
  const [quote, setQuote] = useState<BrowseQuote | null>(null);
  const [challenge, setChallenge] = useState<BrowseChallenge | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await fetchSavedTask(getToken, requestKey);
      if (active && saved !== null) {
        setTask(saved);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken, requestKey]);
  const taskId = task?.id;
  const status = task?.status;
  useEffect(() => {
    if (taskId === undefined || status === "done" || status === "failed") {
      return () => {
        // There is no active polling interval for a finished task.
      };
    }
    let active = true;
    const timer = setInterval(() => {
      void (async () => {
        const updated = await fetchTask(getToken, taskId);
        if (updated !== null && active) {
          setTask(updated);
        }
      })();
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [getToken, status, taskId]);
  const requestQuote = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const result = await fetchQuote(getToken, {
      kind: "browse",
      instruction,
      budgetUsd: budget,
      idempotencyKey: requestKey,
    });
    if (result.kind === "quote") {
      setQuote(result.quote);
      setBudget(result.quote.budgetUsd);
      setChallenge(result.challenge);
    }
    if (result.kind === "task") {
      setTask(result.task);
    }
    if (result.kind === "error") {
      setError(result.error);
    }
    setBusy(false);
  };
  const purchase = async (): Promise<void> => {
    if (quote === null || challenge === null || Date.now() >= quote.expiresAt) {
      setError("This quote expired. Request a new browsing task.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await purchaseTask(getToken, quote, challenge);
    setTask(result.task);
    setError(result.error);
    setChallenge(null);
    setBusy(false);
    if (result.error === null) {
      showBrowser();
    }
  };
  if (task !== null) {
    const text = Schema.decodeUnknownResult(ResultText)(task.result);
    return (
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="text-sm">
          Browsing task ·{" "}
          {task.status === "paused"
            ? "Paused — use Resume in the browser"
            : task.status}
        </p>
        {task.error === null ? null : (
          <p className="text-destructive text-sm" role="alert">
            {task.error}
          </p>
        )}
        {error === null ? null : (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        {text._tag === "Success" ? (
          <p className="max-h-60 overflow-auto text-sm whitespace-pre-wrap">
            {text.success.text}
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={showBrowser}>
          Open browser
        </Button>
      </div>
    );
  }
  return (
    <FieldGroup className="px-3 pb-3">
      <Field>
        <FieldLabel>Browsing budget</FieldLabel>
        <ToggleGroup
          aria-label="Browsing budget"
          disabled={busy || quote !== null}
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
          <ToggleGroupItem value="1">$1</ToggleGroupItem>
          <ToggleGroupItem value="3">$3</ToggleGroupItem>
          <ToggleGroupItem value="5">$5</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          One fixed-price task. Website purchases cost extra. Unused allowance
          and failed tasks are not automatically refunded.
        </FieldDescription>
      </Field>
      {quote === null ? (
        <Button
          disabled={busy}
          onClick={() => {
            void requestQuote();
          }}
          size="sm"
        >
          {busy ? "Getting quote…" : "Get quote"}
        </Button>
      ) : (
        <>
          <p className="text-sm">
            ${quote.budgetUsd} · up to {quote.executionMs / 60_000} active
            minutes · quote expires{" "}
            {new Date(quote.expiresAt).toLocaleTimeString()}
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void purchase();
            }}
            size="sm"
          >
            {busy
              ? "Waiting for payment confirmation…"
              : `Pay $${quote.budgetUsd} and browse`}
          </Button>
        </>
      )}
      {error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </FieldGroup>
  );
};
