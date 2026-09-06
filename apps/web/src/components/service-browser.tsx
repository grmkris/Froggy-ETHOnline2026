import { formatUsd } from "@froggy/domain";
import { ServiceCatalog, ServiceTicket } from "@froggy/protocol";
import type { ServiceCard } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@froggy/ui/components/dialog";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@froggy/ui/components/field";
import { Textarea } from "@froggy/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect, useId, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../lib/session-token";

const Tickets = Schema.Struct({
  v: Schema.Literals([1]),
  tasks: Schema.Array(ServiceTicket),
});
const ErrorBody = Schema.Struct({ error: Schema.String });
const safeLink = (url: string): string | undefined => {
  try {
    const value = new URL(url);
    return value.protocol === "https:" || value.protocol === "http:"
      ? value.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const ImagePreview = ({
  url,
  description,
}: {
  readonly url: string;
  readonly description: string;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${token ?? ""}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, getToken]);
  if (failed) {
    return (
      <p className="text-muted-foreground text-sm">
        Preview unavailable. You can try downloading the image.
      </p>
    );
  }
  return source === null ? (
    <output className="text-muted-foreground text-sm">
      Loading your image…
    </output>
  ) : (
    <img
      className="max-h-80 w-full rounded-lg object-contain"
      src={source}
      alt={description}
    />
  );
};

const TaskResult = ({
  task,
  download,
}: {
  readonly task: ServiceTicket;
  readonly download: (url: string, id: string) => Promise<void>;
}): ReactElement => {
  const [error, setError] = useState<string | null>(null);
  return (
    <article className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{task.service.replaceAll("_", " ")}</span>
        <Badge variant="outline">{task.status}</Badge>
      </div>
      <p className="text-sm">{task.prompt}</p>
      <p className="text-muted-foreground text-xs">
        Task price {formatUsd(task.priceUsdMicros)}
        {task.stubbed ? " · Demo" : null}
        {task.saleId !== null && !task.stubbed ? " · Paid on Hedera" : null}
      </p>
      {task.error === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {task.error}
        </p>
      )}
      {task.text ? (
        <p className="text-sm whitespace-pre-wrap">{task.text}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {task.status === "running" || task.status === "quoted"
            ? "Checking your spending rules, then running the task. If approval is needed, answer in the workspace."
            : "No result yet."}
        </p>
      )}
      {task.sources.map((source) => (
        <div className="flex flex-col gap-1 text-sm" key={source.url}>
          <a
            className="underline underline-offset-4"
            href={safeLink(source.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.title}
          </a>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {source.text}
          </p>
        </div>
      ))}
      {task.artifact?.mime.startsWith("image/") === true ? (
        <ImagePreview url={task.artifact.url} description={task.prompt} />
      ) : null}
      {task.artifact ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void (async () => {
              try {
                await download(task.artifact?.url ?? "", task.id);
              } catch {
                setError("Download failed. Please try again.");
              }
            })();
          }}
        >
          Download {task.artifact.mime.startsWith("audio/") ? "audio" : "image"}
        </Button>
      ) : null}
      {error === null ? null : <p role="alert">{error}</p>}
      {task.saleId === null ? null : (
        <a
          className="text-muted-foreground text-xs underline underline-offset-4"
          href={`/oracle/sales/${task.saleId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Payment record
        </a>
      )}
      {task.upstreamTransactionId === null ? null : (
        <p className="text-muted-foreground text-xs break-all">
          Supplier settlement: {task.upstreamTransactionId}
        </p>
      )}
      <p className="text-muted-foreground text-xs break-all">Task {task.id}</p>
    </article>
  );
};

export const ServiceBrowser = (): ReactElement => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceCard | null>(null);
  const [prompt, setPrompt] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const inputId = useId();
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const api = async (
    path: string,
    init: RequestInit = {}
  ): Promise<Response> => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("authorization", `Bearer ${token ?? ""}`);
    const response = await fetch(path, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const decoded = Schema.decodeUnknownResult(ErrorBody)(
        await response.json().catch(() => null)
      );
      throw new Error(
        decoded._tag === "Success"
          ? decoded.success.error
          : `Request failed (${response.status}).`
      );
    }
    return response;
  };
  const catalog = useQuery({
    queryKey: ["service-catalog"],
    enabled: open,
    retry: false,
    queryFn: async () => {
      const response = await api("/api/services");
      return Schema.decodeUnknownSync(ServiceCatalog)(await response.json());
    },
  });
  const tasks = useQuery({
    queryKey: ["service-tasks"],
    enabled: open,
    retry: false,
    refetchInterval: open ? 3000 : false,
    queryFn: async () => {
      const response = await api("/api/services/tasks");
      return Schema.decodeUnknownSync(Tickets)(await response.json());
    },
  });
  const purchase = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!selected) {
        throw new Error("Choose a service.");
      }
      const response = await api("/api/services/run", {
        method: "POST",
        body: JSON.stringify({
          v: 1,
          service: selected.name,
          prompt,
          idempotencyKey: key,
        }),
      });
      return Schema.decodeUnknownSync(ServiceTicket)(await response.json());
    },
    onSuccess: () => {
      setSelected(null);
      setPrompt("");
      setKey(crypto.randomUUID());
      void queries.invalidateQueries({ queryKey: ["service-tasks"] });
    },
  });
  const download = async (url: string, id: string): Promise<void> => {
    const response = await api(url);
    const blob = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blob;
    anchor.download = `froggy-${id}.${response.headers.get("content-type") === "audio/mpeg" ? "mp3" : (response.headers.get("content-type")?.split("/")[1] ?? "bin")}`;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(blob);
    }, 1000);
  };
  return (
    <>
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2">
        <p className="text-muted-foreground text-xs">
          Research, create, and get a second opinion.
        </p>
        <Button
          onClick={() => {
            setOpen(true);
          }}
          variant="outline"
          size="sm"
        >
          Services
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>What would you like to do?</DialogTitle>
            <DialogDescription>
              One wallet, useful services. Fixed prices, your spending rules,
              and a result you can come back to.
            </DialogDescription>
          </DialogHeader>
          {catalog.isPending ? <output>Loading services…</output> : null}
          {catalog.error ? <p role="alert">{catalog.error.message}</p> : null}
          {selected ? (
            <form
              className="flex flex-col gap-4 rounded-xl border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                purchase.mutate();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{selected.title}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={purchase.isPending}
                  onClick={() => {
                    setSelected(null);
                  }}
                >
                  Back
                </Button>
              </div>
              <Field>
                <FieldLabel htmlFor={inputId}>Your request</FieldLabel>
                <Textarea
                  id={inputId}
                  value={prompt}
                  maxLength={selected.maxInput}
                  required
                  disabled={purchase.isPending}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setKey(crypto.randomUUID());
                    purchase.reset();
                  }}
                />
                <FieldDescription>
                  {selected.description} {prompt.length}/{selected.maxInput}{" "}
                  characters.
                </FieldDescription>
              </Field>
              <p className="text-muted-foreground text-sm">
                {selected.note} Once paid, failed work is not automatically
                refunded.
              </p>
              {purchase.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {purchase.error.message}
                </p>
              ) : null}
              <Button
                disabled={purchase.isPending || prompt.trim() === ""}
                type="submit"
              >
                {purchase.isPending
                  ? "Starting…"
                  : `${selected.status === "demo" ? "Try demo" : "Run task"} · ${formatUsd(selected.priceUsdMicros)}`}
              </Button>
            </form>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.data?.services.map((card) => (
                <article
                  className="flex flex-col gap-3 rounded-xl border p-4"
                  key={card.name}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{card.title}</h3>
                    <Badge variant="secondary">
                      {formatUsd(card.priceUsdMicros)}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground flex-1 text-sm">
                    {card.description}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {card.provider} ·{" "}
                    {card.status === "demo" ? "Demo" : card.status}
                  </p>
                  <Button
                    variant="outline"
                    disabled={card.status === "unavailable"}
                    onClick={() => {
                      setSelected(card);
                      setPrompt("");
                      setKey(crypto.randomUUID());
                      purchase.reset();
                    }}
                  >
                    Choose {card.title.toLowerCase()}
                  </Button>
                  {card.status === "unavailable" ? (
                    <p className="text-muted-foreground text-xs">{card.note}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <section className="flex flex-col gap-3" aria-label="Service tasks">
            <h3 className="font-medium">Your recent tasks</h3>
            {tasks.error ? (
              <p role="alert">
                Couldn’t refresh tasks. Your task may still be running.
              </p>
            ) : null}
            {tasks.data?.tasks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Results from you and your connected agents will appear here.
              </p>
            ) : null}
            {tasks.data?.tasks.map((task) => (
              <TaskResult key={task.id} task={task} download={download} />
            ))}
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
};
