/**
 * The access token, in a form an effect can depend on.
 *
 * Privy's `getAccessToken` is a new function identity on most renders. Passing
 * it straight into a socket effect's dependency array would tear down and
 * rebuild the WebSocket every time Privy's state moved — a reconnect loop that
 * only appears once sign-in is real, which is well after the code looked fine.
 *
 * So the accessor is held in a ref and exposed through a stable callback. The
 * one thing an effect *should* re-run on is whether there is a caller at all,
 * which `canConnect` says.
 */

import { useCallback, useEffect, useRef } from "react";

import { useIdentity } from "./privy";

export interface SessionToken {
  /** There is a signed-in caller — real or the local development identity. */
  readonly canConnect: boolean;
  /** Stable across renders. Returns null when there is no usable token. */
  readonly getToken: () => Promise<string | null>;
}

export const useSessionToken = (): SessionToken => {
  const identity = useIdentity();
  const accessor = useRef(identity.token);

  useEffect(() => {
    accessor.current = identity.token;
  }, [identity.token]);

  const getToken = useCallback(async () => {
    try {
      return await accessor.current();
    } catch {
      // Privy throws when the session has expired out from under the tab. That
      // is a reconnect, not a crash: the caller retries and Privy refreshes.
      return null;
    }
  }, []);

  return { canConnect: identity.ready && identity.authenticated, getToken };
};
