import { connectionKind, connectionWords } from "../lib/connection";
import { useIdentity } from "../lib/privy";
import { useOnline } from "./use-online";

/** Why the composer is locked, or null while the socket is up. */
export const useConnectionLock = (connected: boolean): string | null => {
  const identity = useIdentity();
  const online = useOnline();
  return connectionWords(
    connectionKind({
      authenticated: identity.authenticated,
      connected,
      online,
      ready: identity.ready,
    })
  );
};
