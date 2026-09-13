/** Above the conversation: who holds the page, and a way to bring it into view. */

import { Button } from "@froggy/ui/components/button";
import { DRIVE_LABEL, DrivingDot } from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { BookmarkIcon, GlobeIcon } from "lucide-react";
import type { ReactElement } from "react";

export const ChatToolbar = ({
  drive,
  onShowBrowser,
  onToggleWatchlist,
  watchlistOpen,
}: {
  readonly onToggleWatchlist?: (() => void) | undefined;
  readonly watchlistOpen: boolean;
  readonly drive: DriveMode;
  readonly onShowBrowser: () => void;
}): ReactElement | null => (
  <div className="flex shrink-0 items-center gap-1">
    {drive === "idle" ? null : (
      <span
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs whitespace-nowrap"
      >
        <DrivingDot mode={drive} />
        <span className="sr-only sm:not-sr-only">{DRIVE_LABEL[drive]}</span>
      </span>
    )}
    {onToggleWatchlist === undefined ? null : (
      <Button
        aria-label="Toggle watchlist pane"
        title="Watchlist pane"
        aria-pressed={watchlistOpen}
        onClick={onToggleWatchlist}
        size="icon"
        variant="ghost"
      >
        <BookmarkIcon />
      </Button>
    )}
    <Button
      aria-label="Show the browser"
      title="Open browser"
      className="size-11"
      onClick={onShowBrowser}
      size="icon"
      variant="ghost"
    >
      <GlobeIcon />
    </Button>
  </div>
);
