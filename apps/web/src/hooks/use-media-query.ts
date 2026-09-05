import { useSyncExternalStore } from "react";

/** A media query as a boolean, live. */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (notify) => {
      const list = globalThis.matchMedia(query);
      list.addEventListener("change", notify);
      return () => {
        list.removeEventListener("change", notify);
      };
    },
    () => globalThis.matchMedia(query).matches,
    () => false
  );
