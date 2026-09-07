/**
 * The connection a person just minted, held in memory until they say
 * they pasted it.
 *
 * Module state rather than component state, so walking to the wallet and
 * back does not lose the only copy of a secret the server keeps just a hash
 * of. A reload still clears it, which is the promise the panel makes.
 */

import { useSyncExternalStore } from "react";

interface MintedConnection {
  readonly secret: string;
  readonly skill: string;
}

let minted: MintedConnection | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const read = (): MintedConnection | null => minted;

export const setMintedSkill = (connection: MintedConnection | null): void => {
  minted = connection;
  for (const listener of listeners) {
    listener();
  }
};

export const useMintedSkill = (): MintedConnection | null =>
  useSyncExternalStore(subscribe, read, read);
