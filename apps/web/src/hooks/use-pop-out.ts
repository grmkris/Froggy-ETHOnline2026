/**
 * The pop-out, wired: the reducer, the window link, and the layout width.
 */

import { useEffect, useReducer, useRef } from "react";

import { openPageWindow, pageWindowLink } from "../lib/page-window";
import {
  effectiveMode,
  initialPopOut,
  reducePopOut,
} from "../lib/pop-out-machine";
import type { PopOutMode } from "../lib/pop-out-machine";
import { useMediaQuery } from "./use-media-query";

export interface PopOut {
  readonly handleDock: () => void;
  readonly handleSplit: () => void;
  readonly handleToWindow: () => void;
  readonly mode: PopOutMode;
}

export const usePopOut = (): PopOut => {
  const [state, dispatch] = useReducer(reducePopOut, initialPopOut);
  const wide = useMediaQuery("(min-width: 1024px)");
  const opened = useRef<Window | null>(null);

  useEffect(() => {
    const link = pageWindowLink();
    const unsubscribe = link.subscribe((signal) => {
      if (signal === "claim") {
        dispatch({ type: "window-claimed" });
      } else if (signal === "release") {
        dispatch({ type: "window-released" });
      }
    });
    // A window opened by an earlier incarnation of this tab answers this.
    link.post("ask");
    return () => {
      unsubscribe();
      link.close();
    };
  }, []);

  return {
    handleDock: () => {
      // Docking from a window closes it; the window's own release is what
      // flips the mode back, so a window this tab did not open is left alone.
      if (opened.current !== null && !opened.current.closed) {
        opened.current.close();
      }
      opened.current = null;
      dispatch({ mode: "inline", type: "choose" });
    },
    handleSplit: () => {
      dispatch({ mode: "split", type: "choose" });
    },
    handleToWindow: () => {
      // The window claims the page itself once it has loaded; opening it
      // does not change the mode here, so a blocked popup changes nothing.
      opened.current = openPageWindow();
    },
    mode: effectiveMode(state, wide),
  };
};
