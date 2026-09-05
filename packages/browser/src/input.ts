/**
 * Wire input message → CDP `Input.*` command. A pure translation: no state, no
 * arbitration, no tab selection. The caller has already decided which tab is
 * being typed into and that the human should be credited for it.
 *
 * The one thing worth restating: printable characters never
 * arrive here as key events. The client sends them as `input.text` from a
 * hidden input's `input` event, because that is the only path an IME
 * composition survives — synthesising keydowns for "ありがとう" produces
 * nothing a page can read.
 */

import type { BrowserClientMessage } from "@froggy/protocol";

import type { CdpPayload, CdpTab } from "./cdp";

type InputMessage = Extract<
  BrowserClientMessage,
  { type: "input.key" | "input.mouse" | "input.text" }
>;

/**
 * Non-printable keys need a Windows virtual key code, because a surprising
 * number of sites still branch on `e.keyCode`. Printable keys go through
 * `insertText` and never reach this table.
 */
const VIRTUAL_KEY_CODES = new Map<string, number>([
  [" ", 32],
  ["Alt", 18],
  ["ArrowDown", 40],
  ["ArrowLeft", 37],
  ["ArrowRight", 39],
  ["ArrowUp", 38],
  ["Backspace", 8],
  ["Control", 17],
  ["Delete", 46],
  ["End", 35],
  ["Enter", 13],
  ["Escape", 27],
  ["Home", 36],
  ["Insert", 45],
  ["Meta", 91],
  ["PageDown", 34],
  ["PageUp", 33],
  ["Shift", 16],
  ["Tab", 9],
]);

const virtualKeyCode = (key: string, provided: number): number => {
  if (provided !== 0) {
    return provided;
  }
  // A `Map` rather than an object literal: the key is whatever the browser
  // reported, and `get` returning `undefined` for a miss is the honest shape.
  const known = VIRTUAL_KEY_CODES.get(key);
  if (known !== undefined) {
    return known;
  }
  if (key.length === 1) {
    return key.toUpperCase().codePointAt(0) ?? 0;
  }
  return 0;
};

/** One CDP command: the exact method and parameters a message becomes. */
interface InputCommand {
  readonly method: string;
  readonly params: CdpPayload;
}

/**
 * The exact `(method, params)` pair one client message becomes. Split out from
 * {@link dispatchInput} so the translation is testable without a browser.
 */
export const inputCommand = (message: InputMessage): InputCommand => {
  switch (message.type) {
    case "input.mouse": {
      return {
        method: "Input.dispatchMouseEvent",
        params: {
          button: message.button,
          buttons: message.buttons,
          clickCount: message.clickCount,
          deltaX: message.deltaX,
          deltaY: message.deltaY,
          modifiers: message.modifiers,
          pointerType: "mouse",
          type: message.kind,
          x: message.x,
          y: message.y,
        },
      };
    }
    case "input.key": {
      const code = virtualKeyCode(message.key, message.virtualKeyCode);
      return {
        method: "Input.dispatchKeyEvent",
        params: {
          code: message.code,
          key: message.key,
          modifiers: message.modifiers,
          nativeVirtualKeyCode: code,
          // `rawKeyDown` rather than `keyDown` because there is no text to
          // insert; `keyDown` with empty text makes Chrome swallow the event.
          type: message.down ? "rawKeyDown" : "keyUp",
          windowsVirtualKeyCode: code,
        },
      };
    }
    case "input.text": {
      return { method: "Input.insertText", params: { text: message.text } };
    }
    default: {
      // The union is closed by the extraction above; a new input kind should
      // fail here at compile time rather than silently reach the page as nothing.
      throw new Error(`Unhandled input message: ${JSON.stringify(message)}`);
    }
  }
};

const INPUT_TIMEOUT_MS = 5000;

export const dispatchInput = async (
  tab: CdpTab,
  message: InputMessage
): Promise<void> => {
  const { method, params } = inputCommand(message);
  // Short deadline: input runs at pointer rate and must never queue up behind a
  // wedged renderer for the default thirty seconds.
  await tab.send(method, params, { timeoutMs: INPUT_TIMEOUT_MS });
};
