import type { ConversationId, EmailDraft, EmailMessage } from "@froggy/domain";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@froggy/ui/components/alert-dialog";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@froggy/ui/components/tabs";
import { cn } from "@froggy/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { Schema } from "effect";
import { ArrowLeftIcon, MailIcon, PaperclipIcon, PlusIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";

import { EmailAccount } from "../components/email/email-account";
import { DraftEditor, FileButton } from "../components/email/email-editor";
import { useDrafts } from "../lib/draft-context";
import {
  useEmailClient,
  useEmailDraft,
  useEmailMessage,
  useEmailPage,
  useEmailStatus,
} from "../lib/email-client";

const DELIVERY: Readonly<Record<EmailDraft["status"], string>> = {
  draft: "Draft",
  sending: "Sending",
  accepted: "Sent to provider",
  delivered: "Delivered",
  bounced: "Bounced",
  uncertain: "Delivery unconfirmed",
  discarded: "Discarded",
  failed: "Failed",
};
const time = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const MailEmpty = ({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) => (
  <Empty>
    <EmptyHeader>
      <MailIcon aria-hidden className="text-brand mx-auto mb-3 size-8" />
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const MessageReader = ({ message }: { readonly message: EmailMessage }) => {
  const client = useEmailClient();
  const navigate = useNavigate();
  const memory = useDrafts();
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState(false);
  const files = useEmailPage(message.conversationId);
  const remove = async () => {
    setPending(true);
    try {
      await client.change(`messages/${message.id}`, undefined, "DELETE");
      await navigate({ to: "/inbox", search: {} });
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "Could not delete this message."
      );
    }
    setPending(false);
  };
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Received</Badge>
          {message.stubbed ? (
            <Badge variant="outline">Demo email · no real delivery</Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {message.subject}
        </h1>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd>{message.from}</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd>{message.to.join(", ")}</dd>
          {message.cc.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Cc</dt>
              <dd>{message.cc.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Received</dt>
          <dd>
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {time(message.createdAt)}
            </time>
          </dd>
        </dl>
      </header>
      <div className="flex flex-wrap gap-2 border-y py-3">
        <Button
          variant="outline"
          onClick={() => {
            void navigate({
              to: "/inbox",
              search: { message: message.id, compose: "reply" },
            });
          }}
        >
          Reply
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            memory.editChat(message.conversationId, {
              email: { id: message.id, subject: message.subject },
            });
            void navigate({
              to: "/chat/$conversationId",
              params: { conversationId: message.conversationId },
            });
          }}
        >
          Ask Froggy
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="ghost" disabled={pending} />}
          >
            Delete message and files
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this email?</AlertDialogTitle>
              <AlertDialogDescription>
                The message and its attachments will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep email</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  void remove();
                }}
              >
                Delete email
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {failure ? (
        <p role="alert" className="text-destructive">
          {failure}
        </p>
      ) : null}
      <p className="text-base leading-relaxed whitespace-pre-wrap">
        {message.text}
      </p>
      {message.truncated ? (
        <p className="text-muted-foreground text-sm">
          This message exceeded the processing limit; some content is
          unavailable.
        </p>
      ) : null}
      {message.files.length > 0 ? (
        <section
          aria-label="Attachments"
          className="flex flex-col gap-3 border-t pt-4"
        >
          <h2 className="text-sm font-semibold">Attachments</h2>
          {message.files.map((id, index) => (
            <FileButton
              key={id}
              file={
                files.data?.files.find((file) => file.id === id) ?? {
                  id,
                  name: `Attachment ${index + 1}`,
                }
              }
            />
          ))}
          {files.isError ? (
            <p role="alert">
              Attachments could not be loaded.{" "}
              <Button
                variant="ghost"
                onClick={() => {
                  void files.refetch();
                }}
              >
                Retry
              </Button>
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
};

const DraftReader = ({
  draft,
  onEdit,
}: {
  readonly draft: EmailDraft;
  readonly onEdit: () => void;
}) => {
  const client = useEmailClient();
  const status = useEmailStatus();
  const files = useEmailPage(draft.conversationId);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const act = async (action: string, body: Schema.Json) => {
    setPending(true);
    setFailure("");
    try {
      await client.change(`drafts/${draft.id}/${action}`, body);
      if (action === "discard") {
        await navigate({ to: "/inbox", search: { view: "outgoing" } });
      }
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Email action failed."
      );
    }
    setPending(false);
  };
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Badge variant="secondary" className="self-start">
          {draft.stubbed ? "Demo · " : ""}
          {DELIVERY[draft.status]}
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight">
          {draft.subject}
        </h1>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd>{status.data?.address}</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd>{draft.to.join(", ")}</dd>
          {draft.cc.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Cc</dt>
              <dd>{draft.cc.join(", ")}</dd>
            </>
          ) : null}
          {draft.bcc.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Bcc</dt>
              <dd>{draft.bcc.join(", ")}</dd>
            </>
          ) : null}
        </dl>
      </header>
      <p className="border-t pt-5 text-base leading-relaxed whitespace-pre-wrap">
        {draft.text}
      </p>
      {draft.files.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Attachments">
          {draft.files.map((id, index) => (
            <FileButton
              key={id}
              file={
                files.data?.files.find((file) => file.id === id) ?? {
                  id,
                  name: `Attachment ${index + 1}`,
                }
              }
            />
          ))}
        </section>
      ) : null}
      {(draft.error ?? "") !== "" || failure !== "" ? (
        <p role="alert" className="text-destructive">
          {failure || draft.error}
        </p>
      ) : null}
      {draft.status === "draft" ? (
        <footer className="flex flex-col gap-3 border-t pt-5">
          <p className="text-muted-foreground text-sm">
            Review the recipients, message, and attachments. Only this saved
            revision will be sent.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => {
                void act("approve", { v: 1, revision: draft.revision });
              }}
            >
              {pending ? "Sending…" : "Approve and send"}
            </Button>
            <Button variant="outline" disabled={pending} onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                void act("discard", { v: 1, revision: draft.revision });
              }}
            >
              Discard
            </Button>
          </div>
        </footer>
      ) : null}
    </article>
  );
};

const useInboxSearch = () => useSearch({ from: "/workspace/inbox" });
type InboxSearch = ReturnType<typeof useInboxSearch>;
const hasSelection = (search: InboxSearch): boolean =>
  search.message !== undefined ||
  search.draft !== undefined ||
  search.compose !== undefined;
const outgoingView = (search: InboxSearch): boolean =>
  search.view === "outgoing" || search.draft !== undefined;
const listTitle = (query: string, outgoing: boolean): string => {
  if (outgoing) {
    return "No outgoing email yet";
  }
  return query ? "No matching messages" : "Your Inbox is ready";
};
const MailRow = ({
  record,
  selected,
}: {
  readonly record: EmailMessage | EmailDraft;
  readonly selected: boolean;
}) => (
  <li>
    <Link
      to="/inbox"
      search={
        record.kind === "message"
          ? { message: record.id }
          : { draft: record.id, view: "outgoing" }
      }
      aria-current={selected ? "page" : undefined}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring flex min-w-0 flex-col gap-1 rounded-lg px-3 py-3 outline-none focus-visible:ring-2",
        selected && "bg-brand-soft"
      )}
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span className="truncate">
          {record.kind === "message" ? record.from : DELIVERY[record.status]}
        </span>
        <time
          className="shrink-0"
          dateTime={new Date(record.createdAt).toISOString()}
        >
          {new Date(record.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </time>
      </span>
      <span
        className={cn(
          "line-clamp-2 text-sm",
          record.kind === "message" && !record.read
            ? "font-bold"
            : "font-medium"
        )}
      >
        {record.subject}
      </span>
      <span className="text-muted-foreground line-clamp-2 text-xs">
        {record.text}
      </span>
      <span className="text-brand flex items-center gap-2 text-xs">
        {record.kind === "message" && !record.read ? "Unread" : null}
        {record.files.length > 0 ? (
          <>
            <PaperclipIcon aria-hidden className="size-3" />
            {record.files.length} attachments
          </>
        ) : null}
      </span>
    </Link>
  </li>
);

const InboxRows = ({
  page,
  outgoing,
  query,
}: {
  readonly page: ReturnType<typeof useEmailPage>;
  readonly outgoing: boolean;
  readonly query: string;
}) => {
  const search = useInboxSearch();
  if (page.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (page.isError) {
    return (
      <div role="alert" className="p-3">
        <p>Could not load messages.</p>
        <Button
          variant="ghost"
          onClick={() => {
            void page.refetch();
          }}
        >
          Retry messages
        </Button>
      </div>
    );
  }
  const records = outgoing ? page.data.drafts : page.data.messages;
  if (records.length === 0) {
    return (
      <MailEmpty
        title={listTitle(query, outgoing)}
        description={
          outgoing
            ? "Create a draft and review it before sending."
            : "Sign-up codes, confirmations, and replies will appear here."
        }
      />
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {records.map((record) => (
        <MailRow
          key={record.id}
          record={record}
          selected={(search.message ?? search.draft) === record.id}
        />
      ))}
    </ul>
  );
};

const InboxList = () => {
  const search = useInboxSearch();
  const navigate = useNavigate();
  const status = useEmailStatus();
  const [query, setQuery] = useState("");
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const page = useEmailPage(undefined, query, cursors.at(-1) ?? "");
  const outgoing = outgoingView(search);
  return (
    <section
      aria-label="Email list"
      className={cn(
        "bg-card flex min-h-0 w-full flex-col border-r lg:w-80 lg:shrink-0",
        hasSelection(search) && "hidden lg:flex"
      )}
    >
      <header className="flex shrink-0 flex-col gap-4 border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Inbox</h1>
            <p
              className="text-muted-foreground truncate text-xs"
              title={status.data?.address ?? ""}
            >
              {status.data?.address}
            </p>
          </div>
          <Button
            aria-label="New email"
            size="icon"
            onClick={() => {
              void navigate({ to: "/inbox", search: { compose: "new" } });
            }}
          >
            <PlusIcon />
          </Button>
        </div>
        {status.data?.stubbed === true ? (
          <Badge variant="outline" className="self-start">
            Demo email · no real delivery
          </Badge>
        ) : null}
        {status.data?.mailbox?.active === false ? (
          <p className="text-muted-foreground text-sm">
            Email is disabled. Existing messages remain available.
          </p>
        ) : null}
        <Tabs
          value={outgoing ? "outgoing" : "received"}
          onValueChange={(value) => {
            void navigate({
              to: "/inbox",
              search: value === "outgoing" ? { view: "outgoing" } : {},
            });
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="received" className="flex-1">
              Received
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="flex-1">
              Outgoing
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {outgoing ? (
          <p className="text-muted-foreground text-xs">
            Latest 20 drafts and sent messages.
          </p>
        ) : (
          <Input
            aria-label="Search received messages"
            placeholder="Search received messages…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursors([]);
            }}
            maxLength={200}
          />
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <InboxRows page={page} outgoing={outgoing} query={query} />
      </div>
      {outgoing ? null : (
        <footer className="flex shrink-0 justify-between gap-2 border-t p-3">
          <Button
            variant="ghost"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors((current) => current.slice(0, -1));
            }}
          >
            Newer
          </Button>
          <Button
            variant="ghost"
            disabled={(page.data?.cursor ?? "") === ""}
            onClick={() => {
              const next = page.data?.cursor;
              if (next !== undefined && next !== null && next !== "") {
                setCursors((current) => [...current, next]);
              }
            }}
          >
            Older
          </Button>
        </footer>
      )}
    </section>
  );
};

const InboxContent = ({
  conversationId,
}: {
  readonly conversationId: ConversationId;
}) => {
  const search = useInboxSearch();
  const navigate = useNavigate();
  const message = useEmailMessage(search.message);
  const draft = useEmailDraft(search.draft);
  const queries = useQueryClient();
  const client = useEmailClient();
  const readId = message.data?.read === true ? message.data.id : undefined;
  useEffect(() => {
    if (readId) {
      void queries.invalidateQueries({
        queryKey: ["email", client.owner],
        predicate: (entry) => entry.queryKey[2] !== "message",
      });
    }
  }, [readId, queries, client.owner]);
  const closeEditor = (saved?: EmailDraft["id"]) => {
    void navigate({
      to: "/inbox",
      search: saved ? { draft: saved, view: "outgoing" } : {},
    });
  };
  if (!hasSelection(search)) {
    return (
      <div className="py-24">
        <MailEmpty
          title="A little room to read"
          description="Select a message, or write something new. Froggy is one click away when you need a hand."
        />
      </div>
    );
  }
  const selection = search.draft ? draft : message;
  if (search.message || search.draft) {
    if (selection.isPending) {
      return <Skeleton className="h-64 w-full" />;
    }
    if (selection.isError) {
      return (
        <div role="alert">
          <h2 className="text-lg font-semibold">Email unavailable</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            It may have been deleted, or the connection was interrupted.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void selection.refetch();
            }}
          >
            Retry email
          </Button>
        </div>
      );
    }
  }
  if (search.compose) {
    return (
      <DraftEditor
        key={search.draft ?? search.message ?? "new"}
        conversationId={
          draft.data?.conversationId ??
          message.data?.conversationId ??
          conversationId
        }
        draft={draft.data}
        reply={search.compose === "reply" ? message.data : undefined}
        close={closeEditor}
      />
    );
  }
  if (message.data) {
    return <MessageReader key={message.data.id} message={message.data} />;
  }
  if (draft.data) {
    const record = draft.data;
    return (
      <DraftReader
        key={record.id}
        draft={record}
        onEdit={() => {
          void navigate({
            to: "/inbox",
            search: { draft: record.id, view: "outgoing", compose: "new" },
          });
        }}
      />
    );
  }
  return null;
};

export const InboxPage = () => {
  const status = useEmailStatus();
  const search = useInboxSearch();
  const reader = useRef<HTMLElement | null>(null);
  const selectionKey = `${search.message ?? search.draft ?? ""}:${search.compose ?? ""}`;
  const selected = hasSelection(search);
  useEffect(() => {
    if (selectionKey !== ":" && status.isSuccess && reader.current) {
      reader.current.scrollTop = 0;
      if (window.innerWidth < 1024) {
        reader.current.focus({ preventScroll: true });
      }
    }
  }, [selectionKey, status.isSuccess]);
  if (status.isPending) {
    return (
      <div className="p-6">
        <Skeleton aria-label="Loading Inbox" className="h-64 w-full" />
      </div>
    );
  }
  if (status.isError) {
    return (
      <div className="flex flex-col items-start gap-4 p-6" role="alert">
        <h1 className="text-title">Inbox unavailable</h1>
        <p>{status.error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            void status.refetch();
          }}
        >
          Retry Inbox
        </Button>
      </div>
    );
  }
  const box = status.data.mailbox;
  if (!box) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-xl">
          <EmailAccount />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1" data-slot="inbox-page">
      <InboxList />
      <section
        aria-label="Email reader"
        ref={reader}
        tabIndex={-1}
        className={cn(
          "email-reader min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain",
          !selected && "hidden lg:block"
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-8">
          {selected ? (
            <Link
              to="/inbox"
              search={outgoingView(search) ? { view: "outgoing" } : {}}
              className="text-muted-foreground inline-flex min-h-11 items-center gap-2 self-start text-sm lg:hidden"
            >
              <ArrowLeftIcon aria-hidden className="size-4" />
              Inbox
            </Link>
          ) : null}
          <InboxContent conversationId={box.conversationId} />
        </div>
      </section>
    </div>
  );
};
