/**
 * Who is calling.
 *
 * Every route and both sockets go through here. Before this existed the
 * deployed instance was open: `curl` could drive the shared browser, read the
 * mandate, or unfreeze it, because a missing `Origin` was treated as a
 * trustworthy non-browser client. Same-origin is not authentication, and this
 * module is what replaced that reasoning.
 *
 * The token is Privy's access token and nothing else — no second session
 * system, no cookie of our own. It is verified against a cached JWKS, so the
 * check costs no network round trip.
 *
 * The token travels two ways because the platform gives no single one:
 *
 *   - HTTP: `Authorization: Bearer <token>`, the ordinary thing.
 *   - WebSocket: a **subprotocol**, because a browser `WebSocket` constructor
 *     cannot set headers. A query parameter would work too and is rejected
 *     deliberately: URLs end up in proxy logs, browser history and `Referer`,
 *     and an access token in any of those outlives the tab.
 */

import { decodeUserId } from "@froggy/domain";
import type { UserId } from "@froggy/domain";
import { tokenFromProtocolHeader } from "@froggy/protocol";
import { Result } from "effect";

import type { Services } from "./services";

export const bearerFromRequest = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  if (header === null) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" &&
    token !== undefined &&
    token !== ""
    ? token
    : null;
};

export const bearerFromProtocols = (request: Request): string | null =>
  tokenFromProtocolHeader(request.headers.get("sec-websocket-protocol"));

/**
 * Verify a token and return the caller, or null.
 *
 * Null covers three different situations on purpose — no token, a malformed
 * token, and a DID that does not parse. All three mean the same thing to every
 * caller of this function (refuse), and distinguishing them in the response
 * would tell an attacker which half of their guess was right.
 */
export const authenticate = async (
  services: Services,
  token: string | null
): Promise<UserId | null> => {
  if (token === null) {
    return null;
  }
  const did = await services.privy.verify(token);
  if (did === null) {
    return null;
  }
  const decoded = decodeUserId(did);
  return Result.isFailure(decoded) ? null : decoded.success;
};
