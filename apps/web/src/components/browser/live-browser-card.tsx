/**
 * The live page, inline in the conversation.
 *
 * A card, not a pane: it sits under the turn that opened it, with the driving
 * ring around it and a slim chrome bar above. Taking the page is one click;
 * navigating is typing an address. Popping it out to a split pane or its own
 * window is the same card with more room.
 */

import type { BrowserClientMessage, BrowserState } from "@froggy/protocol";
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
import { useState } from "react";
import type { ReactElement } from "react";

import type { BrowserPainter } from "../../lib/browser-painter";
import { BrowserSurface } from "./browser-surface";

interface PopOutActions {
  readonly handleDock: (() => void) | null;
  readonly handleSplit: (() => void) | null;
  readonly handleToWindow: (() => void) | null;
}

interface LiveBrowserCardProps {
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
  if (state?.frozen === true) {
    return "frozen";
  }
  if (state?.status !== "running") {
    return "idle";
  }
  return state.interaction === "idle" ? "idle" : state.interaction;
};

export const LiveBrowserCard = ({
  connected,
  drive,
  fill = false,
  interactive,
  painter,
  popOut,
  send,
  state,
}: LiveBrowserCardProps): ReactElement => {
  const [draft, setDraft] = useState("");
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
              if (url === "") {
                return;
              }
              send({ type: "browser.navigate", url, v: 1 });
              setDraft("");
            }}
          >
            <Input
              aria-label="Address"
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
            <span className="hidden sm:inline">
              {interactive ? DRIVE_LABEL[drive] : "Watch only on a phone"}
            </span>
          </span>
        }
        trailing={
          <>
            <Button
              aria-label="Take the page"
              disabled={!running}
              onClick={() => {
                send({ type: "browser.take", v: 1 });
              }}
              size="icon-sm"
              title="Take the page"
              variant="ghost"
            >
              <HandIcon />
            </Button>
            {popOut === undefined ? null : <PopOutButtons actions={popOut} />}
          </>
        }
      />
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
