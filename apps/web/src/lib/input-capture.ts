/**
 * DOM events → browser-socket input messages.
 *
 * Every branch in here is a bug someone already hit:
 *
 *   - **Printable characters go through a hidden `<input>`**, not keydown. It is
 *     the only path an IME composition survives; synthesising keydowns for
 *     "ありがとう" delivers nothing a page can read.
 *   - **`setPointerCapture` on pointerdown**, or the remote page never receives
 *     mouseup and stays stuck mid-drag when the pointer leaves the canvas.
 *   - **CDP wheel deltas are inverted** relative to DOM wheel deltas.
 *   - **Release every held key on blur.** Tabbing away mid-chord means the keyup
 *     never arrives and the page believes Shift is still down forever.
 *   - **Coordinates are scaled to the bitmap**, because the canvas is displayed
 *     at whatever size the layout gives it while the page thinks in its own
 *     device pixels.
 */

import type { BrowserClientMessage } from "@froggy/protocol";

/** CDP's modifier bitmask. Not the same numbering as the DOM's. */
const ALT = 1;
const CTRL = 2;
const META = 4;
const SHIFT = 8;

/** The four modifier flags a DOM event reports. */
export interface Modifiers {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Pack the modifiers into CDP's mask.
 *
 * Summed rather than OR'd. The four flags occupy distinct bits and each
 * contributes at most once, so addition produces the identical value while
 * staying readable to anyone who has not memorised the constants.
 */
export const modifiersOf = (event: Modifiers): number =>
  (event.altKey ? ALT : 0) +
  (event.ctrlKey ? CTRL : 0) +
  (event.metaKey ? META : 0) +
  (event.shiftKey ? SHIFT : 0);

const BUTTONS = ["left", "middle", "right"] as const;

export const buttonOf = (index: number): "left" | "middle" | "none" | "right" =>
  BUTTONS[index] ?? "none";

export interface Viewport {
  readonly height: number;
  readonly rect: DOMRect;
  readonly width: number;
}

/** A point in the page's own device pixels. */
export interface BitmapPoint {
  readonly x: number;
  readonly y: number;
}

const clamp = (value: number, max: number): number =>
  Math.min(Math.max(value, 0), max);

/**
 * Map a client point into bitmap space.
 *
 * The bitmap is the authority, not any CSS size we think the canvas has. Note
 * that `getBoundingClientRect()` includes borders — which is why the surface
 * uses a ring and never a border, since a 1px border would offset every click.
 */
export const toBitmapPoint = (
  viewport: Viewport,
  clientX: number,
  clientY: number
): BitmapPoint => {
  const { rect } = viewport;
  const scaleX = rect.width > 0 ? viewport.width / rect.width : 1;
  const scaleY = rect.height > 0 ? viewport.height / rect.height : 1;
  return {
    x: clamp((clientX - rect.left) * scaleX, viewport.width),
    y: clamp((clientY - rect.top) * scaleY, viewport.height),
  };
};

/**
 * Does this key produce text?
 *
 * Single-character keys go through `insertText` unless a non-shift modifier is
 * held, because Ctrl+C is a command rather than the letter "c".
 */
export const isTextProducing = (
  event: Omit<Modifiers, "shiftKey"> & { readonly key: string }
): boolean =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

export const mouseMessage = (input: {
  readonly button: number;
  readonly buttons: number;
  readonly clickCount: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly kind: "mouseMoved" | "mousePressed" | "mouseReleased" | "mouseWheel";
  readonly modifiers: number;
  readonly x: number;
  readonly y: number;
}): BrowserClientMessage => ({
  button: buttonOf(input.button),
  buttons: input.buttons,
  clickCount: input.clickCount,
  // Inverted: CDP's sign convention is the opposite of the DOM's, so a page
  // scrolled the wrong way for everyone until this negation existed.
  deltaX: -(input.deltaX ?? 0),
  deltaY: -(input.deltaY ?? 0),
  kind: input.kind,
  modifiers: input.modifiers,
  type: "input.mouse",
  v: 1,
  x: input.x,
  y: input.y,
});

export const keyMessage = (
  event: KeyboardEvent,
  down: boolean
): BrowserClientMessage => ({
  code: event.code,
  down,
  key: event.key,
  modifiers: modifiersOf(event),
  type: "input.key",
  v: 1,
  // Left for the server's table when the browser does not supply one.
  virtualKeyCode: 0,
});

export const textMessage = (text: string): BrowserClientMessage => ({
  text,
  type: "input.text",
  v: 1,
});
