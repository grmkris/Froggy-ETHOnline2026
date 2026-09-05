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
import { HandIcon, PictureInPicture2Icon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import type { BrowserPainter } from "../../lib/browser-painter";
import { BrowserSurface } from "./browser-surface";

interface LiveBrowserCardProps {
  readonly connected: boolean;
  readonly drive: DriveMode;
  readonly onPopOut?: (() => void) | undefined;
  readonly painter: BrowserPainter;
  readonly send: (message: BrowserClientMessage) => void;
  readonly state: BrowserState | null;
}

export const driveModeOf = (
  state: BrowserState | null,
  frozen: boolean
): DriveMode => {
  if (frozen || state?.frozen === true) {
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
  onPopOut,
  painter,
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
            <span className="hidden sm:inline">{DRIVE_LABEL[drive]}</span>
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
            {onPopOut === undefined ? null : (
              <Button
                aria-label="Pop the page out"
                onClick={onPopOut}
                size="icon-sm"
                title="Pop out"
                variant="ghost"
              >
                <PictureInPicture2Icon />
              </Button>
            )}
          </>
        }
      />
      <BrowserSurface
        connected={connected}
        interactive={drive !== "frozen" || true}
        painter={painter}
        send={send}
        state={state}
      />
    </DrivingRing>
  );
};
