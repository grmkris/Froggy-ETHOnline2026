/**
 * Which keystroke sends.
 *
 * Enter sends and Shift+Enter breaks a line, with one exception that matters
 * to anyone typing in Japanese, Chinese or Korean: Enter while an input
 * method is composing confirms the composition, and must not send.
 */

export interface KeyPress {
  readonly isComposing: boolean;
  readonly key: string;
  readonly shiftKey: boolean;
}

export const sendsOnKey = (press: KeyPress): boolean =>
  press.key === "Enter" && !press.shiftKey && !press.isComposing;
