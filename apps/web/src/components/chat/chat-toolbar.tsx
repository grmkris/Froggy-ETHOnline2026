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
}): ReactElement | null =>
  drive === "idle" && onToggleWatchlist === undefined ? null : (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-1 sm:px-6">
      <span
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs whitespace-nowrap"
      >
        <DrivingDot mode={drive} />
        <span className="sr-only sm:not-sr-only">{DRIVE_LABEL[drive]}</span>
      </span>
      {onToggleWatchlist === undefined ? null : (
        <Button
          aria-label="Toggle watchlist pane"
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
        className="size-11"
        onClick={onShowBrowser}
        size="icon"
        variant="ghost"
      >
        <GlobeIcon />
      </Button>
    </div>
  );
