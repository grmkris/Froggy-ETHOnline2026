import { useSyncExternalStore } from "react";

const subscribe = (onStoreChange: () => void): (() => void) => {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
};

const read = (): boolean => navigator.onLine;

/** Whether this tab currently has a network, from `navigator.onLine`. */
export const useOnline = (): boolean =>
  useSyncExternalStore(subscribe, read, () => true);
