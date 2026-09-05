/**
 * Pointer and keyboard into the shared page.
 *
 * Extracted so every surface that shows the page — the inline card, the split
 * pane, the popped-out window — drives it identically. The rules that matter
 * are in `lib/input-capture.ts`; what lives here is the glue: pointer capture,
 * click counting, the hidden input that gives the IME somewhere to compose.
 */

import type { BrowserClientMessage } from "@froggy/protocol";
import { useCallback, useRef } from "react";
import type {
  KeyboardEvent,
  PointerEvent,
  RefObject,
  WheelEvent,
  ChangeEvent,
} from "react";

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

export interface PageInput {
  readonly canvasProps: {
    readonly onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
    readonly onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
    readonly onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
    readonly onWheel: (event: WheelEvent<HTMLCanvasElement>) => void;
  };
  readonly focusKeyboard: () => void;
  readonly keyboardProps: {
    readonly onBlur: () => void;
    readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    readonly onKeyUp: (event: KeyboardEvent<HTMLInputElement>) => void;
    readonly ref: RefObject<HTMLInputElement | null>;
  };
}

export const usePageInput = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  send: (message: BrowserClientMessage) => void,
  enabled: boolean
): PageInput => {
  const keyboardRef = useRef<HTMLInputElement>(null);
  const lastMoveRef = useRef(0);
  const clickRef = useRef({ at: 0, count: 0 });
  const heldKeys = useRef(new Set<string>());

  const point = useCallback(
    (event: PointerEvent | WheelEvent) => {
      const canvas = canvasRef.current;
      if (canvas === null || !enabled) {
        return null;
      }
      return toBitmapPoint(
        {
          height: canvas.height,
          rect: canvas.getBoundingClientRect(),
          width: canvas.width,
        },
        event.clientX,
        event.clientY
      );
    },
    [canvasRef, enabled]
  );

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    // Without pointer capture the page never sees mouseup if the pointer
    // leaves the canvas mid-drag, and it stays stuck in a selection forever.
    event.currentTarget.setPointerCapture(event.pointerId);
    keyboardRef.current?.focus();
    const now = Date.now();
    clickRef.current =
      now - clickRef.current.at < MULTI_CLICK_MS
        ? { at: now, count: clickRef.current.count + 1 }
        : { at: now, count: 1 };
    send(
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

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    send(
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

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const now = Date.now();
    if (now - lastMoveRef.current < MOVE_THROTTLE_MS) {
      return;
    }
    lastMoveRef.current = now;
    const at = point(event);
    if (at === null) {
      return;
    }
    send(
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

  const onWheel = (event: WheelEvent<HTMLCanvasElement>): void => {
    const at = point(event);
    if (at === null) {
      return;
    }
    send(
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

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Printable characters arrive on the `input` event instead, so the IME
    // gets to compose them first.
    if (isTextProducing(event.nativeEvent)) {
      return;
    }
    event.preventDefault();
    heldKeys.current.add(event.key);
    send(keyMessage(event.nativeEvent, true));
  };

  const onKeyUp = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (isTextProducing(event.nativeEvent)) {
      return;
    }
    heldKeys.current.delete(event.key);
    send(keyMessage(event.nativeEvent, false));
  };

  const onBlur = (): void => {
    // Every key believed down is released. Tabbing away mid-chord otherwise
    // leaves the page convinced a modifier is held indefinitely.
    for (const key of heldKeys.current) {
      send({
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

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { value } = event.target;
    if (value === "") {
      return;
    }
    send(textMessage(value));
    event.target.value = "";
  };

  return {
    canvasProps: { onPointerDown, onPointerMove, onPointerUp, onWheel },
    focusKeyboard: () => {
      keyboardRef.current?.focus();
    },
    keyboardProps: { onBlur, onChange, onKeyDown, onKeyUp, ref: keyboardRef },
  };
};
