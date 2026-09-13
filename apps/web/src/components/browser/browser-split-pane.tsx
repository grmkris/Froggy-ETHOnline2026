import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent,
  PointerEvent,
  ReactElement,
  ReactNode,
} from "react";

const STORAGE_KEY = "froggy.split-width";
const MIN_WIDTH = 380;
const DEFAULT_WIDTH = 560;
const maxWidth = (): number =>
  Math.max(MIN_WIDTH, globalThis.innerWidth - 224 - 480);
const read = (): number => {
  try {
    const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH
      ? Math.min(maxWidth(), stored)
      : Math.min(maxWidth(), DEFAULT_WIDTH);
  } catch {
    return DEFAULT_WIDTH;
  }
};
export interface SplitWidth {
  readonly handlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly width: number;
}
export const useSplitWidth = (): SplitWidth => {
  const [width, setWidth] = useState(read);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    const resize = () => {
      setWidth((current) => Math.min(maxWidth(), current));
    };
    globalThis.addEventListener("resize", resize);
    return () => {
      globalThis.removeEventListener("resize", resize);
      cleanup.current?.();
    };
  }, []);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, String(Math.round(width)));
    } catch {
      /* Width is optional when storage is unavailable. */
    }
  }, [width]);
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      cleanup.current?.();
      event.currentTarget.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = width;
      const { pointerId } = event;
      const move = (next: globalThis.PointerEvent) => {
        if (next.pointerId === pointerId) {
          setWidth(
            Math.min(
              maxWidth(),
              Math.max(MIN_WIDTH, startWidth - (next.clientX - startX))
            )
          );
        }
      };
      const up = () => {
        globalThis.removeEventListener("pointermove", move);
        globalThis.removeEventListener("pointerup", up);
        globalThis.removeEventListener("pointercancel", up);
        cleanup.current = null;
      };
      cleanup.current = up;
      globalThis.addEventListener("pointermove", move);
      globalThis.addEventListener("pointerup", up);
      globalThis.addEventListener("pointercancel", up);
    },
    [width]
  );
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    if (event.key === "Home") {
      setWidth(MIN_WIDTH);
    } else if (event.key === "End") {
      setWidth(maxWidth());
    } else {
      setWidth((current) =>
        Math.min(
          maxWidth(),
          Math.max(
            MIN_WIDTH,
            current + (event.key === "ArrowLeft" ? step : -step)
          )
        )
      );
    }
  };
  return { handlePointerDown, handleKeyDown, width };
};
export const SplitPane = ({
  children,
  onPointerDownHandle,
  onKeyDownHandle,
  width,
}: {
  readonly children: ReactNode;
  readonly onPointerDownHandle: SplitWidth["handlePointerDown"];
  readonly onKeyDownHandle: SplitWidth["handleKeyDown"];
  readonly width: number;
}): ReactElement => (
  <aside
    aria-label="The shared browser, beside the conversation"
    className="bg-background relative flex min-h-0 shrink-0 flex-col border-l p-3"
    style={{ width }}
  >
    <button
      type="button"
      aria-label="Resize the browser pane"
      aria-describedby="browser-resize-help"
      tabIndex={0}
      className="focus-visible:bg-brand-soft focus-visible:outline-ring absolute inset-y-0 -left-1.5 m-0 h-auto w-3 cursor-col-resize touch-none border-0 bg-transparent focus-visible:outline-2"
      onPointerDown={onPointerDownHandle}
      onKeyDown={onKeyDownHandle}
    />
    <span id="browser-resize-help" className="sr-only">
      Browser width {Math.round(width)} pixels. Use Left and Right Arrow to
      resize, or Home and End for the minimum and maximum width.
    </span>
    {children}
  </aside>
);
