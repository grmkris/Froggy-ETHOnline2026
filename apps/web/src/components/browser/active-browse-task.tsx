import type { BrowseTaskView } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Sheet, SheetContent, SheetTitle } from "@froggy/ui/components/sheet";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useBrowseControl } from "../../hooks/use-browse-control";
import {
  BROWSE_LABELS,
  taskPhase,
  taskTerminal,
} from "../../lib/browse-task-state";
import { useWorkspace } from "../../lib/workspace-context";
import { BrowseTaskCard } from "./browse-task-card";

const ActiveTask = ({
  task,
}: {
  readonly task: BrowseTaskView;
}): ReactElement => {
  const actions = useBrowseControl(task);
  const conversationId = task.browse?.conversationId;
  const route = useLocation({ select: (location) => location.pathname });
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Conversation history mounts asynchronously after the route changes.
    const observe = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        setVisible(entry?.isIntersecting === true);
      },
      { threshold: 0.1 }
    );
    let current: HTMLElement | null = null;
    const attach = (): void => {
      const next = document.querySelector<HTMLElement>(
        `#browse-task-${task.id}`
      );
      if (next === current) {
        return;
      }
      if (current !== null) {
        observe.unobserve(current);
      }
      current = next;
      setVisible(false);
      if (next !== null) {
        observe.observe(next);
      }
    };
    // Include the route in this observation's identity without assuming a card exists.
    if (route.length > 0) {
      attach();
    }
    const mounts = new MutationObserver(attach);
    mounts.observe(document.body, { childList: true, subtree: true });
    return () => {
      observe.disconnect();
      mounts.disconnect();
    };
  }, [route, task.id]);
  return (
    <>
      <aside
        hidden={visible || open || taskTerminal(task)}
        aria-label="Active browsing task"
        className="bg-muted/70 flex shrink-0 items-center justify-between gap-2 border-b px-4 py-1 text-sm [&[hidden]]:hidden"
      >
        <Button
          className="min-h-11 min-w-0 flex-1 justify-start"
          variant="ghost"
          onClick={() => {
            setOpen(true);
          }}
        >
          <span className="truncate">
            {BROWSE_LABELS[taskPhase(task)]} · View task
          </span>
        </Button>
        {task.browse?.controls.stop === true ? (
          <Button
            className="min-h-11 shrink-0"
            disabled={actions.pending !== null}
            onClick={() => {
              void actions.control("stop");
            }}
            variant="outline"
          >
            {actions.pending === null ? "Stop browsing" : "Requesting stop…"}
          </Button>
        ) : null}
        {actions.error === null ? null : <p role="alert">{actions.error}</p>}
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="w-full! sm:max-w-xl!"
          side="right"
          finalFocus={() =>
            taskTerminal(task)
              ? (document.querySelector<HTMLElement>("#composer-message") ??
                document.querySelector<HTMLElement>("a[href='/']"))
              : true
          }
        >
          <div className="px-4 pt-4 pr-16">
            <SheetTitle>Browsing task</SheetTitle>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <BrowseTaskCard
              task={task}
              presentation="dialog"
              onWatch={() => {
                setOpen(false);
              }}
            />
            {conversationId === null || conversationId === undefined ? null : (
              <Link
                className="inline-flex min-h-11 items-center underline"
                to="/chat/$conversationId"
                params={{ conversationId }}
                hash={`browse-task-${task.id}`}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Open conversation
              </Link>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
export const ActiveBrowseTask = (): ReactElement | null => {
  const { app } = useWorkspace();
  const task =
    app.browseTasks.find((item) => !taskTerminal(item)) ?? app.browseTasks[0];
  const notices = app.notices.filter((notice) =>
    notice.id.startsWith("browse:")
  );
  return (
    <>
      {task === undefined ? null : <ActiveTask key={task.id} task={task} />}
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="bg-muted/70 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-sm"
        >
          <output>{notice.text}</output>
          <Button
            className="min-h-11"
            variant="ghost"
            onClick={() => {
              app.dispatch({ type: "dismiss", id: notice.id });
            }}
          >
            Dismiss
          </Button>
        </div>
      ))}
      {app.browseRecoveryError ? (
        <p className="px-4 py-2 text-sm" aria-live="polite">
          Browsing task updates could not be restored. Existing tasks may still
          be running.
          <Button
            className="ml-2 min-h-11"
            variant="outline"
            onClick={() => {
              app.retryBrowseTasks();
            }}
          >
            Retry task updates
          </Button>
        </p>
      ) : null}
    </>
  );
};
