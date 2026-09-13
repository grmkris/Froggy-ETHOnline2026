import type { BrowseTaskView } from "@froggy/protocol";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@froggy/ui/components/alert-dialog";
import { Button } from "@froggy/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, CircleIcon, GlobeIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useBrowseControl } from "../../hooks/use-browse-control";
import {
  BROWSE_LABELS,
  taskPhase,
  taskTerminal,
  taskIsStale,
} from "../../lib/browse-task-state";
import { useChatSurface } from "../../lib/chat-context";
import { creditChargeWords, formatCredits } from "../../lib/credit-view";
import { UI_EASE, keyboardInteraction } from "../../lib/motion";
import { useWorkspace } from "../../lib/workspace-context";
import { MarkdownText } from "../stream/markdown-text";
import { BrowserCardCheckout } from "./card-checkout";

import "./browse-task.css";

const elapsed = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};
const TaskActivity = ({
  task,
}: {
  readonly task: BrowseTaskView;
}): ReactElement | null => {
  const rows = useMemo(() => task.browse?.activity ?? [], [task.browse]);
  const [expanded, setExpanded] = useState(false);
  const [unseen, setUnseen] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const follows = useRef(true);
  const last = rows.at(-1)?.id;
  const seen = useRef(new Set(rows.map((row) => row.id)));
  useEffect(() => {
    const node = area.current;
    if (node === null) {
      return;
    }
    for (const row of rows) {
      if (seen.current.has(row.id)) {
        continue;
      }
      seen.current.add(row.id);
      const element = [
        ...node.querySelectorAll<HTMLElement>("[data-activity-id]"),
      ].find((item) => item.dataset["activityId"] === row.id);
      if (
        element !== undefined &&
        element.hidden === false &&
        !keyboardInteraction()
      ) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 125,
          easing: `cubic-bezier(${UI_EASE.join(",")})`,
        });
      }
    }
  }, [rows]);
  useEffect(() => {
    if (last === undefined) {
      return;
    }
    const node = area.current;
    if (node === null) {
      return;
    }
    if (follows.current) {
      node.scrollTop = node.scrollHeight;
    } else {
      setUnseen(true);
    }
  }, [last]);
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Activity</span>
        {rows.length > 4 ? (
          <Button
            className="min-h-11"
            size="sm"
            variant="ghost"
            onClick={() => {
              setExpanded((value) => !value);
            }}
          >
            {expanded ? "Recent activity" : `All ${rows.length} updates`}
          </Button>
        ) : null}
      </div>
      <div
        className="max-h-44 overflow-auto overscroll-contain"
        ref={area}
        onScroll={(event) => {
          const node = event.currentTarget;
          follows.current =
            node.scrollHeight - node.scrollTop - node.clientHeight < 24;
          if (follows.current) {
            setUnseen(false);
          }
        }}
      >
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li
              className="browse-task-activity-row flex items-start gap-2 text-sm [&[hidden]]:hidden"
              key={row.id}
              data-activity-id={row.id}
              hidden={!expanded && index < rows.length - 4}
            >
              <span className="text-muted-foreground mt-0.5 shrink-0">
                {row.status === "done" ? (
                  <CheckIcon aria-hidden className="size-4" />
                ) : (
                  <CircleIcon aria-hidden className="size-4" />
                )}
              </span>
              <span
                className={
                  row.status === "error" ? "text-destructive" : undefined
                }
              >
                {row.status === "error" ? "Issue: " : ""}
                {row.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {unseen ? (
        <Button
          className="min-h-11"
          variant="outline"
          size="sm"
          onClick={() => {
            follows.current = true;
            setUnseen(false);
            if (area.current !== null) {
              area.current.scrollTop = area.current.scrollHeight;
            }
          }}
        >
          New activity
        </Button>
      ) : null}
    </div>
  );
};
const TASK_ACTIONS = [
  {
    action: "take_control",
    permission: "takeControl",
    label: "Take control",
    pending: "Requesting control…",
  },
  {
    action: "continue",
    permission: "continue",
    label: "Continue",
    pending: "Requesting continue…",
  },
  {
    action: "stop",
    permission: "stop",
    label: "Stop browsing",
    pending: "Requesting stop…",
  },
  {
    action: "reconnect",
    permission: "reconnect",
    label: "Reconnect browser",
    pending: "Requesting browser…",
  },
] as const;
const TaskControls = ({
  task,
  onWatch,
}: {
  readonly task: BrowseTaskView;
  readonly onWatch?: (() => void) | undefined;
}): ReactElement => {
  const { showBrowser } = useChatSurface();
  const navigate = useNavigate();
  const handleWatch = (): void => {
    onWatch?.();
    showBrowser();
    const conversationId = task.browse?.conversationId;
    if (conversationId === null || conversationId === undefined) {
      void navigate({ to: "/chat" });
    } else {
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId },
      });
    }
  };
  const actions = useBrowseControl(task);
  const controls = task.browse?.controls;
  const disabled = actions.pending !== null;
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {controls?.watch === true ? (
          <Button className="min-h-11" onClick={handleWatch} variant="outline">
            Watch live
          </Button>
        ) : null}
        {TASK_ACTIONS.filter(
          (action) => controls?.[action.permission] === true
        ).map((action) => (
          <Button
            key={action.action}
            className="min-h-11"
            disabled={disabled}
            variant={
              action.action === "continue" || action.action === "reconnect"
                ? "default"
                : "outline"
            }
            onClick={() => {
              void actions.control(action.action);
            }}
          >
            {actions.pending === action.action ? action.pending : action.label}
          </Button>
        ))}
        {controls?.forceStop === true ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  className="min-h-11"
                  disabled={disabled}
                  variant="destructive"
                />
              }
            >
              Force stop browser
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Close the browser now?</AlertDialogTitle>
              <AlertDialogDescription>
                This closes the shared browser to stop further actions. It
                cannot reverse payments or actions already submitted.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep checking</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    void actions.control("force_stop");
                  }}
                >
                  Close browser and stop
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      {actions.error === null ? null : (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {actions.error}
        </p>
      )}
    </>
  );
};

const TaskResult = ({
  task,
}: {
  readonly task: BrowseTaskView;
}): ReactElement => (
  <>
    {task.result?.outcome === undefined ? null : (
      <output className="mt-3 block text-sm">
        Goal {task.result.outcome.status}: {task.result.outcome.reason}
      </output>
    )}
    {task.error === null ? null : (
      <p className="text-destructive mt-3 text-sm" role="alert">
        {task.error}
      </p>
    )}
    {task.result?.text === undefined ? null : (
      <div className="mt-3 max-h-80 overflow-auto">
        <MarkdownText live={false} text={task.result.text} />
      </div>
    )}
  </>
);

export const BrowseTaskCard = ({
  task,
  presentation = "timeline",
  onWatch,
}: {
  readonly task: BrowseTaskView;
  readonly presentation?: "timeline" | "dialog";
  readonly onWatch?: (() => void) | undefined;
}): ReactElement => {
  const { app } = useWorkspace();
  const [now, setNow] = useState(Date.now);
  const terminal = taskTerminal(task);
  const [completion, setCompletion] = useState({
    initial: terminal,
    current: terminal,
  });
  if (completion.current !== terminal) {
    setCompletion({ ...completion, current: terminal });
  }
  const phase = taskPhase(task);
  const [status, setStatus] = useState({ phase, fresh: false });
  if (status.phase !== phase) {
    setStatus({ phase, fresh: true });
  }
  useEffect(() => {
    if (terminal) {
      return () => {
        // No active resource needs cleanup.
      };
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [terminal]);
  const progress = task.browse;
  const stale = taskIsStale(task, app.connected, now);
  const working =
    !stale &&
    progress?.refreshedAt !== null &&
    progress?.refreshedAt !== undefined &&
    ["queued", "starting", "working", "finalizing"].includes(phase);
  return (
    <section
      aria-label="Browsing task"
      className="bg-card shadow-card rounded-xl border p-3 sm:p-4"
      id={presentation === "timeline" ? `browse-task-${task.id}` : undefined}
    >
      <header className="flex min-h-16 items-start gap-3">
        <span className="bg-muted rounded-full p-2">
          {phase === "done" ? (
            <CheckIcon
              aria-hidden
              className="browse-task-completion size-5"
              data-fresh={!completion.initial && phase === "done"}
            />
          ) : (
            <GlobeIcon aria-hidden className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold">
            {task.input.instruction}
          </h3>
          <p
            className="browse-task-status mt-1 flex min-h-5 items-center gap-2 text-sm"
            aria-live="polite"
          >
            {working ? (
              <span
                aria-hidden
                className="browse-task-working bg-drive-agent size-2 shrink-0 rounded-full"
              />
            ) : null}
            <span
              key={phase}
              className="browse-task-status"
              data-new={status.fresh}
            >
              {BROWSE_LABELS[phase]}
            </span>
          </p>
        </div>
      </header>
      <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        <span>
          {task.priceCreditUnits === undefined
            ? `$${(task.priceUsdMicros / 1_000_000).toFixed(2)} approved`
            : `${formatCredits(task.priceCreditUnits)} ${creditChargeWords(task.chargeStatus)}`}
        </span>
        {progress === null ? (
          <span>Legacy browser task</span>
        ) : (
          <span>{elapsed(progress.activeMs)} active time</span>
        )}
        {progress?.stubbed === true ? <span>Simulated task</span> : null}
      </div>
      {stale ? (
        <p className="mt-3 text-sm" aria-live="polite">
          Updates are reconnecting. The browser agent may still be working.
        </p>
      ) : null}
      <div className="mt-3">
        <TaskActivity task={task} />
      </div>
      <TaskResult task={task} />
      <TaskControls task={task} onWatch={onWatch} />
      <BrowserCardCheckout taskId={task.id} />
    </section>
  );
};
