/**
 * Whether this person has been through the welcome flow.
 *
 * `GET` is what Home asks before it decides what to show; `PUT` is the flow's
 * last act, whichever way out was taken. A person's route, never an agent
 * token's: `agentMayCall` does not list it. Nothing here changes what may be
 * spent — the grant the flow asks for goes the same way it does from Settings.
 */

import type { UserId } from "@froggy/domain";
import { SetupRequest } from "@froggy/protocol";
import type { SetupState } from "@froggy/protocol";
import type { Store } from "@froggy/wallet";
import { Schema } from "effect";

const decodeRequest = Schema.decodeUnknownResult(SetupRequest);

const json = (
  body: SetupState | { readonly error: string },
  status = 200
): Response =>
  Response.json(body, { headers: { "cache-control": "no-store" }, status });

/** `GET` and `PUT /api/setup`. */
export const handleSetup = async (
  store: Pick<Store, "setup">,
  request: Request,
  userId: UserId,
  now: number
): Promise<Response> => {
  if (request.method === "PUT") {
    const decoded = decodeRequest(await request.json().catch(() => null));
    if (decoded._tag === "Failure") {
      return json({ error: 'Send {"v": 1, "seen": true}.' }, 400);
    }
    const seenAt = decoded.success.seen ? now : null;
    await store.setup.save(userId, seenAt);
    return json({ seenAt, v: 1 });
  }
  if (request.method !== "GET") {
    return json({ error: "Not found." }, 404);
  }
  return json({ seenAt: await store.setup.load(userId), v: 1 });
};
