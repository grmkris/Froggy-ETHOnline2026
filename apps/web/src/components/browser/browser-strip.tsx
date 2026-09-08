/**
 * The page, small, while the live card is scrolled away.
 *
 * During a run the agent keeps changing the page; a strip floating over the
 * top of the stream keeps a thumbnail of it in view so the person never loses
 * sight of what the agent is doing, and one click brings the card back. It
 * floats rather than sits in the column so its coming and going never moves
 * the words underneath.
 */

import { DrivingDot, DRIVE_LABEL } from "@froggy/ui/components/driving-ring";
import type { DriveMode } from "@froggy/ui/components/driving-ring";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import type { BrowserPainter } from "../../lib/browser-painter";

interface BrowserStripProps {
  readonly drive: DriveMode;
  readonly onJump: () => void;
  readonly painter: BrowserPainter;
  readonly url: string | null;
}

export const BrowserStrip = ({
  drive,
  onJump,
  painter,
  url,
}: BrowserStripProps): ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    return canvas === null ? undefined : painter.attach(canvas);
  }, [painter]);
  return (
    <button
      className="bg-card/90 shadow-float mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl p-2 pr-4 text-left backdrop-blur-md"
      onClick={onJump}
      type="button"
    >
      <canvas
        aria-hidden="true"
        className="bg-paper-deep h-12 w-20 rounded-lg object-cover"
        ref={canvasRef}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-xs">
          <DrivingDot mode={drive} />
          {DRIVE_LABEL[drive]}
        </span>
        <span className="text-machine text-muted-foreground block truncate">
          {url ?? "—"}
        </span>
      </span>
      <span className="text-xs font-medium">Jump to page</span>
    </button>
  );
};
