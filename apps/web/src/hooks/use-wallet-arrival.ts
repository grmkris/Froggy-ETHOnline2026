/**
 * Tell the server the moment Privy has minted this person's wallet.
 *
 * Privy creates the embedded wallet in the browser, after sign-in, and links it
 * a moment later. Our first authenticated request can land before that link is
 * readable — on 10 Sep it did, and the wallet was already eight seconds old by
 * Privy's own timestamp when the server looked and saw nothing.
 *
 * The miss is survivable. What was not is that nothing looked again: the grant
 * is asked for on an authenticated *request*, and a person who has just signed
 * in and is sitting still makes none, so an empty answer stood until they
 * happened to do something a minute later. They stared at a wallet-less screen
 * in the meantime, which is the one state this product cannot afford to be in
 * silently.
 *
 * So this watches the side that knows first. The browser learns the address
 * from Privy directly; when it has one and the server does not, it says so,
 * once, through the refresh entry point the grant path already has.
 */

import { useEffect, useRef } from "react";

/** Enough for Privy's link to become readable, short enough to be invisible. */
const SETTLE_MS = 1200;

export const useWalletArrival = (input: {
  readonly getToken: () => Promise<string | null>;
  /** The address Privy told this browser about, or null while it has none. */
  readonly privyAddress: string | null;
  /** The address the server knows, or null while it knows none. */
  readonly serverAddress: string | null;
}): void => {
  const { getToken, privyAddress, serverAddress } = input;
  // Asked once per address. A server that keeps answering null after being
  // told is a different fault, and hammering it would hide rather than fix it.
  const told = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
    if (
      privyAddress === null ||
      serverAddress !== null ||
      told.current === privyAddress
    ) {
      return stop;
    }
    told.current = privyAddress;
    // A short wait rather than none: the server is about to ask Privy for this
    // same wallet, and asking a beat after the browser saw it is what makes the
    // difference between finding it and repeating the miss.
    timer = setTimeout(() => {
      void (async () => {
        const token = await getToken();
        const headers = new Headers();
        if (token !== null) {
          headers.set("authorization", `Bearer ${token}`);
        }
        await fetch("/api/agent-signer/refresh", {
          headers,
          method: "POST",
        }).catch(() => null);
      })();
    }, SETTLE_MS);
    return stop;
  }, [getToken, privyAddress, serverAddress]);
};
