/**
 * The live page, inline in the conversation.
 *
 * A card, not a pane: it sits under the turn that opened it, with the driving
 * ring around it and a slim chrome bar above. Taking the page is one click;
 * navigating is typing an address. Popping it out to a split pane or its own
 * window is the same card with more room.
 */

import type {
  BrowserClientMessage,
  BrowserState,
  BrowseTaskView,
} from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { ChromeBar } from "@froggy/ui/components/chrome-bar";
import {
  DRIVE_LABEL,
  DrivingDot,
  DrivingRing,
} from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { Input } from "@froggy/ui/components/input";
import {
  Columns2Icon,
  ExternalLinkIcon,
  HandIcon,
  PanelRightCloseIcon,
} from "lucide-react";
import { useContext, useState } from "react";
import type { ReactElement } from "react";

import { useBrowseControl } from "../../hooks/use-browse-control";
import { taskTerminal } from "../../lib/browse-task-state";
import type { BrowserPainter } from "../../lib/browser-painter";
import { WorkspaceContext } from "../../lib/workspace-context";
import { BrowserSurface } from "./browser-surface";

interface PopOutActions {
  readonly handleDock: (() => void) | null;
  readonly handleSplit: (() => void) | null;
  readonly handleToWindow: (() => void) | null;
}

interface LiveBrowserCardProps {
  readonly hostedTask?: BrowseTaskView | undefined;
  readonly connected: boolean;
  readonly drive: DriveMode;
  /** Fill the parent's height rather than keeping the page's aspect ratio. */
  readonly fill?: boolean;
  /** False on a phone: watch only, and the chrome bar says so. */
  readonly interactive: boolean;
  readonly painter: BrowserPainter;
  readonly popOut?: PopOutActions | undefined;
  readonly send: (message: BrowserClientMessage) => void;
  readonly state: BrowserState | null;
}

const PopOutButtons = ({
  actions,
}: {
  readonly actions: PopOutActions;
}): ReactElement => (
  <>
    {actions.handleSplit === null ? null : (
      <Button
        aria-label="Show the page beside the conversation"
        onClick={actions.handleSplit}
        size="icon-sm"
        title="Split pane"
        variant="ghost"
      >
        <Columns2Icon />
      </Button>
    )}
    {actions.handleDock === null ? null : (
      <Button
        aria-label="Put the page back in the conversation"
        onClick={actions.handleDock}
        size="icon-sm"
        title="Dock"
        variant="ghost"
      >
        <PanelRightCloseIcon />
      </Button>
    )}
    {actions.handleToWindow === null ? null : (
      <Button
        aria-label="Open the page in a new window"
        onClick={actions.handleToWindow}
        size="icon-sm"
        title="New window"
        variant="ghost"
      >
        <ExternalLinkIcon />
      </Button>
    )}
  </>
);

export const driveModeOf = (state: BrowserState | null): DriveMode => {
  if (state?.status !== "running") {
    return "idle";
  }
  return state.interaction === "idle" ? "idle" : state.interaction;
};

const CloudIdleWarning = ({
  state,
  send,
}: Pick<LiveBrowserCardProps, "state" | "send">): ReactElement | null => {
  if (
    state?.cloud?.control !== "human" ||
    state.cloud.idleExpiresAt === undefined
  ) {
    return null;
  }
  return (
    <output className="bg-muted flex items-center justify-between gap-2 px-3 py-2 text-xs">
      <span>
        Browser closes at{" "}
        {new Date(state.cloud.idleExpiresAt).toLocaleTimeString()} unless you
        extend the session.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          send({ type: "browser.start", v: 1 });
        }}
      >
        Keep open
      </Button>
    </output>
  );
};

const HostedBrowserControls = ({
  task,
}: {
  readonly task: BrowseTaskView;
}): ReactElement => {
  const actions = useBrowseControl(task);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {task.browse?.controls.takeControl === true ? (
        <Button
          className="min-h-11"
          disabled={actions.pending !== null}
          onClick={() => {
            void actions.control("take_control");
          }}
          variant="outline"
        >
          {actions.pending === "take_control"
            ? "Requesting control…"
            : "Take control"}
        </Button>
      ) : null}
      {task.browse?.controls.continue === true ? (
        <Button
          className="min-h-11"
          disabled={actions.pending !== null}
          onClick={() => {
            void actions.control("continue");
          }}
          variant="outline"
        >
          {actions.pending === "continue" ? "Requesting continue…" : "Continue"}
        </Button>
      ) : null}
      {actions.error === null ? null : (
        <span className="text-destructive text-xs" role="alert">
          {actions.error}
        </span>
      )}
    </div>
  );
};

const BrowserActions = ({
  task,
  state,
  connected,
  running,
  send,
  popOut,
}: Pick<LiveBrowserCardProps, "state" | "connected" | "send" | "popOut"> & {
  readonly task: BrowseTaskView | undefined;
  readonly running: boolean;
}): ReactElement => (
  <>
    {task === undefined &&
    state?.cloud !== undefined &&
    state.cloud.control === "human" ? (
      <Button
        size="sm"
        disabled={!connected}
        variant="outline"
        onClick={() => {
          send({ type: "browser.resume", v: 1 });
        }}
      >
        Resume
      </Button>
    ) : null}
    {state?.cloud?.control === "stopping" ? (
      <span className="text-muted-foreground text-xs">Stopping…</span>
    ) : null}
    {task === undefined ? (
      <Button
        aria-label="Take the page"
        disabled={
          !connected || !running || state?.cloud?.control === "stopping"
        }
        onClick={() => {
          send({ type: "browser.take", v: 1 });
        }}
        size="icon"
        title="Take the page"
        variant="ghost"
      >
        <HandIcon />
      </Button>
    ) : (
      <HostedBrowserControls task={task} />
    )}
    {popOut === undefined ? null : <PopOutButtons actions={popOut} />}
  </>
);

export const LiveBrowserCard = ({
  connected,
  drive,
  fill = false,
  interactive,
  painter,
  popOut,
  send,
  state,
  hostedTask,
}: LiveBrowserCardProps): ReactElement => {
  const [draft, setDraft] = useState("");
  const workspace = useContext(WorkspaceContext);
  const task =
    hostedTask ??
    workspace?.app.browseTasks.find(
      (item) => item.browse?.executor === "hosted" && !taskTerminal(item)
    );
  const canNavigate =
    connected &&
    interactive &&
    (state?.cloud === undefined || state.cloud.control === "human");
  const current = state?.tabs.find((tab) => tab.id === state.activeTabId);
  const running = state?.status === "running";
  return (
    <DrivingRing className="bg-card shadow-card overflow-hidden" mode={drive}>
      <ChromeBar
        address={
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const url = draft.trim();
              if (url === "" || !canNavigate) {
                return;
              }
              send({ type: "browser.navigate", url, v: 1 });
              setDraft("");
            }}
          >
            <Input
              aria-label="Address"
              disabled={!canNavigate}
              className="text-machine bg-paper-deep/70 h-7 rounded-full px-3"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              placeholder={current?.url ?? "https://…"}
              value={draft}
            />
          </form>
        }
        leading={
          <span className="flex items-center gap-1.5 pl-1 text-xs whitespace-nowrap">
            <DrivingDot mode={drive} />
            <span className="text-xs">
              {interactive ? DRIVE_LABEL[drive] : "Watch only on a phone"}
            </span>
          </span>
        }
        trailing={
          <BrowserActions
            task={task}
            state={state}
            connected={connected}
            running={running}
            send={send}
            popOut={popOut}
          />
        }
      />
      <CloudIdleWarning state={state} send={send} />
      <BrowserSurface
        className={fill ? "min-h-0 flex-1" : undefined}
        connected={connected}
        interactive={interactive}
        painter={painter}
        send={send}
        state={state}
      />
    </DrivingRing>
  );
};
