import { describe, expect, it } from "bun:test";

import {
  buttonOf,
  isTextProducing,
  modifiersOf,
  mouseMessage,
  toBitmapPoint,
} from "./input-capture";
import type { Viewport } from "./input-capture";

const noModifiers = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

const viewport = (rect: Partial<DOMRect>): Viewport => ({
  height: 800,
  // SAFETY: `toBitmapPoint` reads only left, top, width and height. A full
  // `DOMRect` cannot be constructed outside a browser, and the four fields it
  // touches are all present.
  rect: { height: 400, left: 0, top: 0, width: 640, ...rect } as DOMRect,
  width: 1280,
});

describe("modifiersOf", () => {
  it("is zero with nothing held", () => {
    expect(modifiersOf(noModifiers)).toBe(0);
  });

  it("uses CDP's bit values, which are not the DOM's", () => {
    expect(modifiersOf({ ...noModifiers, altKey: true })).toBe(1);
    expect(modifiersOf({ ...noModifiers, ctrlKey: true })).toBe(2);
    expect(modifiersOf({ ...noModifiers, metaKey: true })).toBe(4);
    expect(modifiersOf({ ...noModifiers, shiftKey: true })).toBe(8);
  });

  it("combines held modifiers", () => {
    expect(modifiersOf({ ...noModifiers, ctrlKey: true, shiftKey: true })).toBe(
      10
    );
  });
});

describe("toBitmapPoint", () => {
  it("scales a click into the page's own device pixels", () => {
    // The canvas is displayed at whatever size the layout gives it; the page
    // only understands the bitmap it painted.
    const point = toBitmapPoint(viewport({}), 320, 200);

    expect(point).toEqual({ x: 640, y: 400 });
  });

  it("accounts for the canvas position on screen", () => {
    const point = toBitmapPoint(viewport({ left: 100, top: 50 }), 420, 250);

    expect(point).toEqual({ x: 640, y: 400 });
  });

  it("clamps a pointer that left the canvas", () => {
    const point = toBitmapPoint(viewport({}), 10_000, -50);

    expect(point).toEqual({ x: 1280, y: 0 });
  });

  it("survives a canvas with no layout box", () => {
    const point = toBitmapPoint(viewport({ height: 0, width: 0 }), 5, 5);

    expect(point).toEqual({ x: 5, y: 5 });
  });
});

describe("mouseMessage", () => {
  it("inverts wheel deltas", () => {
    // CDP's sign convention is the opposite of the DOM's, and the page scrolled
    // the wrong way for everyone until this negation existed.
    const message = mouseMessage({
      button: -1,
      buttons: 0,
      clickCount: 0,
      deltaX: 12,
      deltaY: -30,
      kind: "mouseWheel",
      modifiers: 0,
      x: 0,
      y: 0,
    });

    expect(message).toMatchObject({ deltaX: -12, deltaY: 30 });
  });
});

describe("buttonOf", () => {
  it("names the three real buttons", () => {
    expect(buttonOf(0)).toBe("left");
    expect(buttonOf(1)).toBe("middle");
    expect(buttonOf(2)).toBe("right");
  });

  it("reports no button for a move", () => {
    expect(buttonOf(-1)).toBe("none");
  });
});

describe("isTextProducing", () => {
  it("treats a bare character as text", () => {
    // Text goes through the hidden input's `input` event as `insertText`; it is
    // the only path an IME composition survives.
    expect(isTextProducing({ ...noModifiers, key: "a" })).toBe(true);
  });

  it("treats a chord as a command, not text", () => {
    expect(isTextProducing({ ...noModifiers, ctrlKey: true, key: "c" })).toBe(
      false
    );
  });

  it("treats a named key as not text", () => {
    expect(isTextProducing({ ...noModifiers, key: "Enter" })).toBe(false);
  });

  it("keeps Shift+letter as text", () => {
    expect(isTextProducing({ ...noModifiers, key: "A" })).toBe(true);
  });
});
