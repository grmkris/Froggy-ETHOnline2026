/**
 * The shared page.
 *
 * A canvas the human can click into, and a badge saying who is currently
 * driving. The interaction rules that matter are in `lib/input-capture.ts`; the
 * one that matters *here* is the ring: `getBoundingClientRect()` includes
 * borders, so a bordered canvas would offset every click by the border width —
 * a bug that presents as "clicks land slightly wrong" and takes an hour to find.
 */

import type {
  BrowserClientMessage,
  BrowserState,
  InteractionMode,
} from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { useCallback, useRef, useState } from "react";

import {
  isTextProducing,
  keyMessage,
  modifiersOf,
  mouseMessage,
  textMessage,
  toBitmapPoint,
} from "../lib/input-capture";

const MOVE_THROTTLE_MS = 16;
const MULTI_CLICK_MS = 350;

interface BrowserPaneProps {
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly connected: boolean;
  readonly onSend: (message: BrowserClientMessage) => void;
  readonly state: BrowserState | null;
}

/** Amber for the agent, green for you, grey for nobody. */
const MODE_TONE = {
  agent: "border-amber-500/60 text-amber-300",
  human: "border-emerald-500/60 text-emerald-300",
  idle: "border-white/20 text-white/60",
} as const satisfies Record<InteractionMode, string>;

const MODE_LABEL = {
  agent: "agent is driving",
  human: "you have the page",
  idle: "idle",
} as const satisfies Record<InteractionMode, string>;

/**
 * What to say when the pane is not showing a live page.
 *
 * A separate function rather than nested ternaries in the markup: there are
 * four distinct reasons the picture is missing and each deserves a sentence
 * that tells the reader what to do about it.
 */
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
  return connected ? "The shared browser has not started yet." : "Connecting…";
};

export const BrowserPane = ({
  canvasRef,
  connected,
  onSend,
  state,
}: BrowserPaneProps): React.ReactElement => {
  const keyboardRef = useRef<HTMLInputElement>(null);
  const lastMoveRef = useRef(0);
  const clickRef = useRef({ at: 0, count: 0 });
  const heldKeys = useRef(new Set<string>());
  const [url, setUrl] = useState("");

  const viewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return null;
    }
    return {
      height: canvas.height,
      rect: canvas.getBoundingClientRect(),
      width: canvas.width,
    };
  }, [canvasRef]);

  const point = useCallback(
    (event: React.PointerEvent | React.WheelEvent) => {
      const view = viewport();
      if (view === null) {
        return null;
      }
      return toBitmapPoint(view, event.clientX, event.clientY);
    },
    [viewport]
  );

  const onPointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    // Without pointer capture the page never sees mouseup if the pointer leaves
    // the canvas mid-drag, and it stays stuck in a selection forever.
    event.currentTarget.setPointerCapture(event.pointerId);
    keyboardRef.current?.focus();
    const now = Date.now();
    clickRef.current =
      now - clickRef.current.at < MULTI_CLICK_MS
        ? { at: now, count: clickRef.current.count + 1 }
        : { at: now, count: 1 };
    onSend(
      mouseMessage({
        button: event.button,
        buttons: event.buttons,
        clickCount: clickRef.current.count,
        kind: "mousePressed",
        modifiers: modifiersOf(event),
        ...at,
      })
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    onSend(
      mouseMessage({
        button: event.button,
        buttons: event.buttons,
        clickCount: clickRef.current.count,
        kind: "mouseReleased",
        modifiers: modifiersOf(event),
        ...at,
      })
    );
  };

  const onPointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ): void => {
    const now = Date.now();
    if (now - lastMoveRef.current < MOVE_THROTTLE_MS) {
      return;
    }
    lastMoveRef.current = now;
    const at = point(event);
    if (at === null) {
      return;
    }
    onSend(
      mouseMessage({
        button: -1,
        buttons: event.buttons,
        clickCount: 0,
        kind: "mouseMoved",
        modifiers: modifiersOf(event),
        ...at,
      })
    );
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    onSend(
      mouseMessage({
        button: -1,
        buttons: 0,
        clickCount: 0,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        kind: "mouseWheel",
        modifiers: modifiersOf(event),
        ...at,
      })
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Printable characters arrive on the `input` event instead, so the IME gets
    // to compose them first.
    if (isTextProducing(event.nativeEvent)) {
      return;
    }
    event.preventDefault();
    heldKeys.current.add(event.key);
    onSend(keyMessage(event.nativeEvent, true));
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (isTextProducing(event.nativeEvent)) {
      return;
    }
    heldKeys.current.delete(event.key);
    onSend(keyMessage(event.nativeEvent, false));
  };

  const onBlur = (): void => {
    // Every key believed down is released. Tabbing away mid-chord otherwise
    // leaves the page convinced a modifier is held indefinitely.
    for (const key of heldKeys.current) {
      onSend({
        code: key,
        down: false,
        key,
        modifiers: 0,
        type: "input.key",
        v: 1,
        virtualKeyCode: 0,
      });
    }
    heldKeys.current.clear();
  };

  const mode = state?.interaction ?? "idle";
  const status = state?.status ?? "idle";

  const handleStart = (): void => {
    onSend({ type: "browser.start", v: 1 });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge className={MODE_TONE[mode]} variant="outline">
          {MODE_LABEL[mode]}
        </Badge>
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim() === "") {
              return;
            }
            onSend({ type: "browser.navigate", url: url.trim(), v: 1 });
          }}
        >
          <input
            aria-label="Address"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm outline-none focus:border-white/30"
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            placeholder={state?.tabs[0]?.url ?? "https://…"}
            value={url}
          />
          <Button size="sm" type="submit" variant="outline">
            Go
          </Button>
        </form>
        <Button
          onClick={() => {
            onSend({ type: "browser.take", v: 1 });
          }}
          size="sm"
          variant="outline"
        >
          Take the page
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
        <canvas
          className="h-full w-full object-contain"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          ref={canvasRef}
        />
        {status === "running" ? null : (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm text-white/70">
            <div className="max-w-md space-y-3">
              <p>{overlayMessage(status, state?.error ?? null, connected)}</p>
              <Button
                disabled={status === "starting"}
                onClick={handleStart}
                size="sm"
              >
                {status === "unavailable" ? "Check again" : "Start the browser"}
              </Button>
            </div>
          </div>
        )}
        {/* The focus proxy for keyboard and IME. Off-screen, never display:none —
            a hidden input cannot be focused, and an unfocusable one receives no
            composition events. */}
        <input
          aria-hidden="true"
          className="absolute top-0 -left-[9999px] h-px w-px opacity-0"
          onBlur={onBlur}
          onChange={(event) => {
            const { value } = event.target;
            if (value === "") {
              return;
            }
            onSend(textMessage(value));
            event.target.value = "";
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          ref={keyboardRef}
          tabIndex={-1}
        />
      </div>
    </section>
  );
};
