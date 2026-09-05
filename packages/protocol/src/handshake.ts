/**
 * How a token reaches a WebSocket.
 *
 * A browser's `WebSocket` constructor cannot set headers — its only extension
 * point is the subprotocol list — so the access token travels as a
 * subprotocol. The alternative, a query parameter, is rejected deliberately:
 * URLs end up in proxy logs, browser history and `Referer`, and an access
 * token in any of those outlives the tab that created it.
 *
 * This lives in the protocol package because both ends have to agree on it,
 * and a wire format known to only one of them is how the two drift.
 */

/** Offered alongside the token so the server has something to select. */
export const WS_PROTOCOL = "froggy.v1";

/**
 * The token's prefix.
 *
 * RFC 6455 requires each subprotocol to be an HTTP token, and a JWT is
 * base64url segments joined by dots — every character of which is a valid
 * `tchar`, so this needs no further encoding.
 */
export const WS_TOKEN_PREFIX = "bearer.";

/** What the client offers. The server selects `WS_PROTOCOL` and reads the rest. */
export const wsProtocols = (token: string): string[] => [
  WS_PROTOCOL,
  `${WS_TOKEN_PREFIX}${token}`,
];

/** The token from a `Sec-WebSocket-Protocol` header value, or null. */
export const tokenFromProtocolHeader = (
  header: string | null
): string | null => {
  if (header === null) {
    return null;
  }
  for (const entry of header.split(",")) {
    const value = entry.trim();
    if (value.startsWith(WS_TOKEN_PREFIX)) {
      const token = value.slice(WS_TOKEN_PREFIX.length);
      return token === "" ? null : token;
    }
  }
  return null;
};
