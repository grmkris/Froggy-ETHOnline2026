/** Above the conversation: who holds the page, and a way to bring it into view. */

import { Button } from "@froggy/ui/components/button";
import { DRIVE_LABEL, DrivingDot } from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { GlobeIcon } from "lucide-react";
import type { ReactElement } from "react";

import { RecentConversations } from "./recent-conversations";

export const ChatToolbar = ({
  drive,
  onShowBrowser,
}: {
  readonly drive: DriveMode;
  readonly onShowBrowser: () => void;
}): ReactElement => (
  <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-1 sm:px-6">
    <span
      aria-live="polite"
      className="flex items-center gap-1.5 text-xs whitespace-nowrap"
    >
      <DrivingDot mode={drive} />
      <span className="sr-only sm:not-sr-only">{DRIVE_LABEL[drive]}</span>
    </span>
    <RecentConversations />
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
