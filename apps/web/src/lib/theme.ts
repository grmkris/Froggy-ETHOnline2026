/** Appearance is local to this browser; a URL preview never overwrites it. */
import { useSyncExternalStore } from "react";

import { keyboardInteraction } from "./motion";

const STORAGE_KEY = "froggy-theme";
type Theme = "passbook" | "lilypad" | "system";

const parseTheme = (value: string | null | undefined): Theme | null =>
  value === "passbook" || value === "lilypad" || value === "system"
    ? value
    : null;

const readSavedTheme = (): Theme => {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY)) ?? "passbook";
  } catch {
    // Private browsers can deny storage; appearance still works for this tab.
    return "passbook";
  }
};

let preference: Theme = "passbook";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = (): Theme => preference;

const applyTheme = (): void => {
  const dark =
    preference === "lilypad" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset["theme"] = dark ? "lilypad" : "passbook";
  for (const listener of listeners) {
    listener();
  }
};

/** Called before React mounts, including on sign-in and the browser pop-out. */
export const initializeTheme = (): void => {
  preference =
    parseTheme(new URL(window.location.href).searchParams.get("theme")) ??
    readSavedTheme();
  applyTheme();
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", applyTheme);
  window.addEventListener("storage", (event) => {
    if (
      (event.key === STORAGE_KEY || event.key === null) &&
      parseTheme(new URL(window.location.href).searchParams.get("theme")) ===
        null
    ) {
      preference = readSavedTheme();
      applyTheme();
    }
  });
};

const setTheme = (value: string | null | undefined): void => {
  const next = parseTheme(value);
  if (next === null) {
    return;
  }
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The selection remains usable when persistence is unavailable.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("theme");
  window.history.replaceState(window.history.state, "", url);
  // A browser snapshot crossfades the entire palette without remounting forms.
  if ("startViewTransition" in document && !keyboardInteraction()) {
    document.startViewTransition({ update: applyTheme, types: ["appearance"] });
  } else {
    applyTheme();
  }
};

export const useTheme = () => ({
  theme: useSyncExternalStore(subscribe, snapshot),
  setTheme,
});
