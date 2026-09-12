import type { Conversation } from "@froggy/domain";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@froggy/ui/components/dialog";
import { Field, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HistoryIcon, PlusIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { ReactElement } from "react";

import { useChatSurface } from "../../lib/chat-context";
import {
  useHistoryPage,
  useHistoryStale,
  useHistoryWrite,
} from "../../lib/history-client";

const useConversationChange = () => {
  const { refresh, request } = useHistoryWrite();
  const { conversationId, newChat } = useChatSurface();
  const patch = useMutation({
    mutationFn: async (input: {
      readonly archived: boolean;
      readonly conversation: Conversation;
    }) => {
      await request(`/api/conversations/${input.conversation.id}`, {
        body: JSON.stringify({
          archived: input.archived,
          revision: input.conversation.revision,
          v: 1,
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
    },
    onSuccess: async () => {
      await refresh();
    },
    retry: false,
  });
  const remove = useMutation({
    mutationFn: async (conversation: Conversation) => {
      await request(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
      });
      if (conversation.id === conversationId) {
        newChat();
      }
    },
    onSuccess: async () => {
      await refresh();
    },
    retry: false,
  });
  return { patch, remove };
};

const archiveLabel = (archived: boolean, pending: boolean): string => {
  if (archived) {
    return pending ? "Reopening…" : "Unarchive";
  }
  return pending ? "Archiving…" : "Archive";
};

const ConversationActions = ({
  conversation,
}: {
  readonly conversation: Conversation;
}): ReactElement => {
  const { patch, remove } = useConversationChange();
  const busy = patch.isPending || remove.isPending;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {conversation.archived ? (
        <Button
          disabled={busy}
          onClick={() => {
            patch.mutate({ archived: false, conversation });
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {archiveLabel(true, patch.isPending)}
        </Button>
      ) : (
        <Button
          disabled={busy}
          onClick={() => {
            patch.mutate({ archived: true, conversation });
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {archiveLabel(false, patch.isPending)}
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger
          disabled={busy}
          render={<Button size="sm" type="button" variant="ghost" />}
        >
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages in “{conversation.title}” are removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError ? (
            <p className="text-destructive text-sm" role="alert">
              {remove.error.message} The conversation is still here.
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={remove.isPending}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(conversation);
              }}
              variant="destructive"
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {patch.isError ? (
        <p className="text-destructive text-xs" role="alert">
          {patch.error.message}
        </p>
      ) : null}
    </div>
  );
};

const emptyConversations = (query: string, archived: boolean): string => {
  if (query !== "") {
    return "No matching conversations.";
  }
  if (archived) {
    return "No archived conversations.";
  }
  return "Your conversations will appear here.";
};

const RecentPage = ({
  archived,
  onArchivedChange,
  onOpen,
  query,
}: {
  readonly archived: boolean;
  readonly onArchivedChange: (archived: boolean) => void;
  readonly onOpen: () => void;
  readonly query: string;
}): ReactElement => {
  const [cursors, setCursors] = useState<string[]>([]);
  const before = cursors.at(-1) ?? null;
  const path = `/api/conversations?limit=20&archived=${archived}&q=${encodeURIComponent(query)}${before === null ? "" : `&before=${encodeURIComponent(before)}`}`;
  const page = useHistoryPage(path);
  const conversations = page.records.filter(
    (record): record is Conversation => record.kind === "conversation"
  );
  if (page.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (page.isError) {
    return (
      <p role="alert">
        History could not be loaded.{" "}
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
  return (
    <>
      <ToggleGroup
        aria-label="Which conversations"
        multiple={false}
        onValueChange={(values) => {
          const [selected] = values;
          if (selected === "recent" || selected === "archived") {
            onArchivedChange(selected === "archived");
          }
        }}
        value={[archived ? "archived" : "recent"]}
        variant="outline"
      >
        <ToggleGroupItem value="recent">Recent</ToggleGroupItem>
        <ToggleGroupItem value="archived">Archived</ToggleGroupItem>
      </ToggleGroup>
      {conversations.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {emptyConversations(query, archived)}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {conversations.map((conversation) => (
          <li className="flex items-start gap-1" key={conversation.id}>
            <Link
              className="hover:bg-muted focus-visible:ring-ring flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-3 outline-none focus-visible:ring-2"
              onClick={onOpen}
              params={{ conversationId: conversation.id }}
              to="/chat/$conversationId"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{conversation.title}</span>
                <Badge variant="outline">
                  {conversation.source === "telegram" ? "Telegram" : "Web"}
                </Badge>
              </span>
              <span className="text-muted-foreground line-clamp-2 text-sm">
                {conversation.preview}
              </span>
              {conversation.latestStatus !== undefined &&
              conversation.latestStatus !== "completed" ? (
                <Badge variant="outline">{conversation.latestStatus}</Badge>
              ) : null}
              <time
                className="text-muted-foreground text-xs"
                dateTime={new Date(conversation.updatedAt).toISOString()}
              >
                {new Date(conversation.updatedAt).toLocaleString()}
              </time>
            </Link>
            <ConversationActions conversation={conversation} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        {cursors.length > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setCursors((current) => current.slice(0, -1));
            }}
          >
            Newer conversations
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
            Older conversations
          </Button>
        )}
      </div>
    </>
  );
};
export const RecentConversations = ({
  compact = false,
}: {
  readonly compact?: boolean;
}): ReactElement => {
  const { newChat } = useChatSurface();
  const stale = useHistoryStale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const query = useDeferredValue(search);
  return (
    <div className="flex items-center gap-1">
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger
          render={
            <Button
              aria-label="Recent"
              className="min-h-11"
              size="sm"
              variant="ghost"
            />
          }
        >
          <HistoryIcon data-icon="inline-start" />
          <span className={compact ? "sr-only" : undefined}>Recent</span>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recent conversations</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="conversation-search">
              Search conversations
            </FieldLabel>
            <Input
              id="conversation-search"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Title or message…"
              value={search}
            />
          </Field>
          {stale ? (
            <output className="text-muted-foreground text-sm">
              Updates are delayed. Showing saved conversations.
            </output>
          ) : null}
          {open ? (
            <RecentPage
              archived={archived}
              key={`${query}:${archived}`}
              onArchivedChange={setArchived}
              onOpen={() => {
                setOpen(false);
              }}
              query={query}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Button
        aria-label="New chat"
        className="min-h-11"
        onClick={newChat}
        size="sm"
        variant="ghost"
      >
        <PlusIcon data-icon="inline-start" />
        <span className={compact ? "sr-only" : undefined}>New chat</span>
      </Button>
    </div>
  );
};

export const ConversationHeader = (): ReactElement => {
  const stale = useHistoryStale();
  const {
    conversation,
    historyRecords,
    hasOlder,
    loadingOlder,
    loadOlder,
    historyError,
    retryHistory,
  } = useChatSurface();
  return (
    <>
      <div
        className={
          conversation === null
            ? "hidden"
            : "mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6"
        }
      >
        {conversation === null ? null : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">
                {conversation.title}
              </h1>
              <p className="text-muted-foreground text-xs">
                {conversation.source} ·{" "}
                {new Date(conversation.updatedAt).toLocaleDateString()}
                {conversation.archived ? " · archived" : ""}
              </p>
            </div>
            <ConversationActions conversation={conversation} />
          </div>
        )}
        <Button
          nativeButton={false}
          render={<Link to="/activity" />}
          size="sm"
          variant="ghost"
        >
          Activity
        </Button>
        {historyRecords.some((record) => record.status === "interrupted") ? (
          <Badge variant="outline">Interrupted · saved output</Badge>
        ) : null}
        {historyRecords.some((record) => record.recovered) ? (
          <Badge variant="outline">Recovered from Telegram cache</Badge>
        ) : null}
        {historyRecords.some((record) => record.truncated) ? (
          <Badge variant="outline">Some content is truncated</Badge>
        ) : null}
        {stale ? (
          <Badge variant="outline">Updates delayed · saved snapshot</Badge>
        ) : null}
        {hasOlder ? (
          <Button
            disabled={loadingOlder}
            onClick={() => {
              void loadOlder();
            }}
            size="sm"
            variant="ghost"
          >
            {loadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        ) : null}
      </div>
      {historyError === null ? null : (
        <div
          className="mx-auto flex max-w-3xl items-center gap-3 p-4"
          role="alert"
        >
          <p className="text-sm">{historyError}</p>
          <Button onClick={retryHistory} variant="outline">
            Retry history
          </Button>
        </div>
      )}
    </>
  );
};
