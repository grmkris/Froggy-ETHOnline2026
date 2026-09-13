import type {
  Monitor,
  MonitorCheck,
  UserId,
  WatchlistItem,
} from "@froggy/domain";
import { ServiceRequest } from "@froggy/protocol";
import { Schema } from "effect";

import { MONITOR_CHECK_USD_MICROS, updateMonitorCheck } from "./monitoring";
import { serviceCatalog } from "./service-providers";
import { purchaseService } from "./service-tasks";
import type { TaskCaller, TaskDeps } from "./tasks";

/** Known token prices use the existing structured provider before any Chrome. */
export const beginDataCheck = async (
  deps: TaskDeps,
  owner: UserId,
  check: MonitorCheck,
  monitor: Monitor,
  item: WatchlistItem,
  caller: TaskCaller
): Promise<boolean> => {
  if (
    item.source._tag !== "token" ||
    !["price_below", "price_drop"].includes(monitor.condition._tag)
  ) {
    return false;
  }
  const card = serviceCatalog(deps.services).find(
    (entry) => entry.name === "token_inspect"
  );
  if (!card || card.status === "unavailable") {
    return false;
  }
  if (card.priceUsdMicros > MONITOR_CHECK_USD_MICROS) {
    throw new Error(
      "The current data-service price exceeds this check's $1 maximum."
    );
  }
  if (caller.scopes !== null && !caller.scopes.has("services")) {
    throw new Error(
      "This monitor requires the initiating connection's services permission."
    );
  }
  const workspace = await deps.workspaces.hydrate(owner);
  const ticket = await purchaseService(
    {
      services: deps.services,
      session: workspace.session,
      agentTokenId: caller.agentTokenId,
      connectionId: monitor.connectionId,
      interactive: false,
      monitorCheckId: check.id,
      budgetUsdMicros: MONITOR_CHECK_USD_MICROS,
    },
    Schema.decodeUnknownSync(ServiceRequest)({
      v: 2,
      service: "token_inspect",
      idempotencyKey: `monitor:${check.id}`,
      input: { network: item.source.network, address: item.source.address },
    })
  );
  await updateMonitorCheck(deps.services.store, owner, check.id, {
    taskId: ticket.id,
    status: "running",
  });
  return true;
};
