/**
 * The one-time skill a person just minted, held in memory until they say
 * they pasted it.
 *
 * Module state rather than component state, so walking to the wallet and
 * back does not lose the only copy of a secret the server keeps just a hash
 * of. A reload still clears it, which is the promise the panel makes.
 */

import { useSyncExternalStore } from "react";

let minted: string | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const read = (): string | null => minted;

export const setMintedSkill = (skill: string | null): void => {
  minted = skill;
  for (const listener of listeners) {
    listener();
  }
};

export const useMintedSkill = (): string | null =>
  useSyncExternalStore(subscribe, read, read);
