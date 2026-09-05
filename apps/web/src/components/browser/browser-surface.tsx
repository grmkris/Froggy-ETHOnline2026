/**
 * The page itself: a canvas you can click into, and what to show when there
 * is no page yet.
 *
 * The canvas uses a ring and never a border — `getBoundingClientRect()`
 * includes borders, and a bordered canvas offsets every click by the border
 * width, a bug that presents as "clicks land slightly wrong". The hidden input
 * beside it is the focus proxy for keyboard and IME; it is off-screen, never
 * `display: none`, because a hidden input cannot be focused and an
 * unfocusable one receives no composition events.
 */

import type { BrowserClientMessage, BrowserState } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { cn } from "@froggy/ui/lib/utils";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import { usePageInput } from "../../hooks/use-page-input";
import type { BrowserPainter } from "../../lib/browser-painter";

interface BrowserSurfaceProps {
  readonly className?: string | undefined;
  readonly connected: boolean;
  readonly interactive: boolean;
  readonly painter: BrowserPainter;
  readonly send: (message: BrowserClientMessage) => void;
  readonly state: BrowserState | null;
}

const ordinal = (position: number): string => {
  const rules = new Intl.PluralRules("en", { type: "ordinal" });
  const suffix = {
    few: "rd",
    many: "th",
    one: "st",
    other: "th",
    two: "nd",
    zero: "th",
  }[rules.select(position)];
  return `${position}${suffix}`;
};

const overlayMessage = (
  status: BrowserState["status"],
  error: string | null,
  connected: boolean
): string => {
  if (status === "unavailable") {
    return error ?? "No Chrome found.";
  }
  if (status === "crashed") {
    return `The browser crashed: ${error ?? "unknown reason"}`;
  }
  return connected
    ? "Nothing open yet. Ask for something, or start the browser yourself."
    : "Connecting…";
};

/**
 * What to say when the surface is not showing a live page.
 *
 * Its own component rather than nested ternaries: there are six distinct
 * reasons the picture is missing and each deserves a sentence that tells the
 * reader what to do about it.
 */
const Overlay = ({
  connected,
  onStart,
  state,
}: {
  readonly connected: boolean;
  readonly onStart: () => void;
  readonly state: BrowserState | null;
}): ReactElement | null => {
  const status = state?.status ?? "idle";
  if (status === "running") {
    return null;
  }
  if (state?.queue !== null && state?.queue !== undefined) {
    return (
      <div className="bg-background/85 absolute inset-0 grid place-items-center p-6 text-center">
        <div className="max-w-sm space-y-1">
          <p className="font-display text-lg font-semibold">
            You are {ordinal(state.queue.position)} in line
          </p>
          <p className="text-muted-foreground text-sm">
            Every browser seat is taken. Yours opens automatically, and the chat
            keeps working meanwhile.
          </p>
        </div>
      </div>
    );
  }
  if (status === "starting") {
    return (
      <div className="bg-background/85 absolute inset-0 space-y-3 p-6">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <p className="text-muted-foreground text-xs">Opening your browser…</p>
      </div>
    );
  }
  const message = overlayMessage(status, state?.error ?? null, connected);
  return (
    <div className="bg-background/85 absolute inset-0 grid place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm">{message}</p>
        <Button disabled={!connected} onClick={onStart} size="sm">
          {status === "idle" ? "Start the browser" : "Try again"}
        </Button>
      </div>
    </div>
  );
};

export const BrowserSurface = ({
  className,
  connected,
  interactive,
  painter,
  send,
  state,
}: BrowserSurfaceProps): ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = usePageInput(canvasRef, send, interactive);

  useEffect(() => {
    const canvas = canvasRef.current;
    return canvas === null ? undefined : painter.attach(canvas);
  }, [painter]);

  const viewport = state?.viewport ?? { height: 800, width: 1280 };
  return (
    <div
      className={cn("bg-paper-deep relative overflow-hidden", className)}
      style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}
    >
      <canvas
        aria-label={
          interactive
            ? "The shared browser. Click to take the page."
            : "The shared browser. Open Froggy on a desktop to drive it."
        }
        className={cn(
          "block h-full w-full object-contain",
          interactive ? "cursor-default" : "pointer-events-none"
        )}
        inert={!interactive}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            input.focusKeyboard();
          }
        }}
        ref={canvasRef}
        tabIndex={interactive ? 0 : -1}
        {...input.canvasProps}
      />
      <Overlay
        connected={connected}
        onStart={() => {
          send({ type: "browser.start", v: 1 });
        }}
        state={state}
      />
      <input
        aria-hidden="true"
        className="absolute top-0 -left-[9999px] h-px w-px opacity-0"
        tabIndex={-1}
        {...input.keyboardProps}
      />
    </div>
  );
};
