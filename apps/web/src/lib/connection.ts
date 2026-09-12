/**
 * Why the workspace is not live: the network, the session, or the server.
 *
 * The badge and the locked composer used to say the same "reconnecting…" for
 * all three. The words here are the only ones either surface should use.
 */

export type ConnectionKind = "connected" | "offline" | "server" | "signed-out";

export const connectionKind = (input: {
  readonly authenticated: boolean;
  readonly connected: boolean;
  readonly online: boolean;
  readonly ready: boolean;
}): ConnectionKind => {
  if (input.connected) {
    return "connected";
  }
  if (!input.online) {
    return "offline";
  }
  if (input.ready && !input.authenticated) {
    return "signed-out";
  }
  return "server";
};

const WORDS: Record<Exclude<ConnectionKind, "connected">, string> = {
  offline: "You're offline",
  server: "Couldn't reach Froggy",
  "signed-out": "Sign in again",
};

/** Null while the socket is up; otherwise the sentence for the badge. */
export const connectionWords = (kind: ConnectionKind): string | null =>
  kind === "connected" ? null : WORDS[kind];
