/**
 * The page beside the conversation, with a handle between them.
 *
 * The width is the person's: dragged, and remembered per browser. Layout is
 * a CSS grid on the parent; this component only owns the handle and the
 * number it produces.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactElement, ReactNode } from "react";

const STORAGE_KEY = "froggy.split-width";
const MIN_WIDTH = 380;
const DEFAULT_WIDTH = 560;

const read = (): number => {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH
      ? stored
      : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

const write = (width: number): void => {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Storage can be unavailable; the width simply resets next time.
  }
};

export interface SplitWidth {
  readonly handlePointerDown: (event: PointerEvent<HTMLHRElement>) => void;
  readonly width: number;
}

export const useSplitWidth = (): SplitWidth => {
  const [width, setWidth] = useState(read);
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    write(width);
  }, [width]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLHRElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragging.current = { startWidth: width, startX: event.clientX };
      const max = Math.max(MIN_WIDTH, globalThis.innerWidth * 0.65);
      const move = (moveEvent: globalThis.PointerEvent): void => {
        const drag = dragging.current;
        if (drag === null) {
          return;
        }
        // The pane is on the right, so dragging left makes it wider.
        const next = drag.startWidth - (moveEvent.clientX - drag.startX);
        setWidth(Math.min(max, Math.max(MIN_WIDTH, next)));
      };
      const up = (): void => {
        dragging.current = null;
        globalThis.removeEventListener("pointermove", move);
        globalThis.removeEventListener("pointerup", up);
      };
      globalThis.addEventListener("pointermove", move);
      globalThis.addEventListener("pointerup", up);
    },
    [width]
  );

  return { handlePointerDown, width };
};

export const SplitPane = ({
  children,
  onPointerDownHandle,
  width,
}: {
  readonly children: ReactNode;
  readonly onPointerDownHandle: (event: PointerEvent<HTMLHRElement>) => void;
  readonly width: number;
}): ReactElement => (
  <aside
    aria-label="The shared browser, beside the conversation"
    className="bg-background/60 relative flex min-h-0 flex-col border-l p-3"
    style={{ width }}
  >
    <hr
      aria-label="Resize the browser pane"
      aria-orientation="vertical"
      className="absolute top-0 bottom-0 -left-1.5 m-0 h-auto w-3 cursor-col-resize border-0 bg-transparent"
      onPointerDown={onPointerDownHandle}
    />
    {children}
  </aside>
);
