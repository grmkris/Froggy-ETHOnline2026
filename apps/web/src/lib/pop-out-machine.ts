/**
 * Where the page is shown: inline in the conversation, in a split pane
 * beside it, or in its own window.
 *
 * A pure reducer because the transitions have rules worth pinning: a window
 * that claims the page wins over whatever the tab had chosen, a window that
 * releases it hands the page back to where it was before, and a narrow
 * screen cannot hold a split pane however hard it is asked.
 */

export type PopOutMode = "inline" | "split" | "window";

export interface PopOutState {
  /** What the person chose in this tab; restored when a window releases. */
  readonly chosen: "inline" | "split";
  readonly mode: PopOutMode;
}

export type PopOutEvent =
  | { readonly type: "choose"; readonly mode: "inline" | "split" }
  | { readonly type: "window-claimed" }
  | { readonly type: "window-released" };

export const initialPopOut: PopOutState = { chosen: "inline", mode: "inline" };

export const reducePopOut = (
  state: PopOutState,
  event: PopOutEvent
): PopOutState => {
  switch (event.type) {
    case "choose": {
      // A window holds the page regardless of what this tab would prefer;
      // the preference is kept for when the window closes.
      return state.mode === "window"
        ? { ...state, chosen: event.mode }
        : { chosen: event.mode, mode: event.mode };
    }
    case "window-claimed": {
      return { ...state, mode: "window" };
    }
    case "window-released": {
      return { ...state, mode: state.chosen };
    }
    default: {
      return state;
    }
  }
};

/** The mode the layout can actually honour: no split pane on a narrow screen. */
export const effectiveMode = (state: PopOutState, wide: boolean): PopOutMode =>
  state.mode === "split" && !wide ? "inline" : state.mode;
