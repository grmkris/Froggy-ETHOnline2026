import { LaunchWatchId } from "@froggy/domain";
import { LaunchWatchTicket } from "@froggy/protocol";
import { Schema } from "effect";

import type { Services } from "./services";
import type { TaskCaller } from "./tasks";

const json = (value: Schema.Json, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

export const handleLaunchWatches = async (
  services: Services,
  caller: TaskCaller,
  request: Request
): Promise<Response> => {
  const path = new URL(request.url).pathname;
  const connection = caller.grantId ?? caller.agentTokenId;
  try {
    if (path === "/api/services/watches" && request.method === "GET") {
      const watches = await services.launches.list(caller.userId, connection);
      return json({
        v: 1,
        watches: watches.map((watch) =>
          Schema.decodeUnknownSync(LaunchWatchTicket)(watch)
        ),
      });
    }
    const id = Schema.decodeUnknownSync(LaunchWatchId)(
      path.slice("/api/services/watches/".length)
    );
    if (request.method !== "GET" && request.method !== "DELETE") {
      return json({ v: 1, error: "Method not allowed." }, 405);
    }
    const watch =
      request.method === "DELETE"
        ? await services.launches.cancel(caller.userId, id, connection)
        : await services.launches.get(caller.userId, id, connection);
    return json(Schema.decodeUnknownSync(LaunchWatchTicket)(watch));
  } catch {
    return json({ v: 1, error: "Watch not found or invalid request." }, 404);
  }
};
