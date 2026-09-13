import { creditUnits, MonitorCheckId } from "@froggy/domain";
import type { CreditLimits, Mandate, Task, UserId } from "@froggy/domain";
import { Schema } from "effect";

import { connectionScopes } from "./capabilities";
import { assertMonitorCurrent, monitoringState } from "./monitoring";
import type { Services } from "./services";

/** Wallet caps seed credit limits once; signer expiry and approval thresholds do not. */
export const creditLimitsFromMandate = (mandate: Mandate): CreditLimits => {
  const perTask = mandate.rules.find((rule) => rule._tag === "per_tx_cap");
  const daily = mandate.rules
    .filter((rule) => rule._tag === "window_cap")
    .find((rule) => rule.windowMs === 86_400_000);
  return {
    perTaskUnits: creditUnits(perTask?.maxUsdMicros ?? 2_000_000),
    dailyUnits: creditUnits(daily?.maxUsdMicros ?? 10_000_000),
    expiresAt: null,
    frozen: false,
  };
};

export const authorizeCreditTask = async (
  services: Pick<Services, "store">,
  owner: UserId,
  task: Task
): Promise<void> => {
  const scopes = await connectionScopes(
    services.store,
    owner,
    task.connectionId
  );
  const scope = task.kind === "service" ? "services" : task.kind;
  if (scopes !== null && !scopes.has(scope)) {
    throw new Error(
      `This connection no longer has ${scope} permission. Credits were returned.`
    );
  }
  if (
    task.input["monitorCheckId"] !== undefined &&
    scopes !== null &&
    !scopes.has("automation")
  ) {
    throw new Error(
      "This connection no longer has automation permission. Credits were returned."
    );
  }
  const monitorId = Schema.decodeUnknownResult(MonitorCheckId)(
    task.input["monitorCheckId"]
  );
  if (monitorId._tag === "Success") {
    const state = await monitoringState(services.store, owner);
    const check = state.checks.find((entry) => entry.id === monitorId.success);
    if (check === undefined) {
      throw new Error(
        "The monitor check no longer exists. Credits were returned."
      );
    }
    await assertMonitorCurrent(services.store, owner, check);
  }
};

export class CreditCommitUncertainError extends Error {
  override readonly name = "CreditCommitUncertainError";
}

/** Historical chain sales retain their recorded terms; new tasks settle the internal ledger. */
export const finishCreditTask = async (
  services: Pick<Services, "store">,
  owner: UserId,
  task: Task,
  patch: Parameters<Services["store"]["tasks"]["update"]>[2],
  outcome: "capture" | "release" | "uncertain"
): Promise<void> => {
  if (task.chargeId === undefined) {
    await services.store.tasks.update(owner, task.id, patch);
  } else {
    try {
      await services.store.credits.finishTask(
        owner,
        task.id,
        patch,
        outcome,
        patch.updatedAt
      );
    } catch (error) {
      if (outcome !== "capture") {
        throw error;
      }
      const result = Schema.decodeUnknownResult(
        Schema.Record(Schema.String, Schema.Unknown)
      )(patch.result);
      const message =
        "The result is ready, but its credit charge could not be confirmed. Credits remain held for reconciliation.";
      let pending = { ...patch, status: "uncertain" as const, error: message };
      if (result._tag === "Success") {
        pending = {
          ...pending,
          result: { ...result.success, creditDeliveryReady: true },
        };
      }
      try {
        await services.store.credits.finishTask(
          owner,
          task.id,
          pending,
          "uncertain",
          patch.updatedAt
        );
      } catch {
        // Leave the original durable reservation held if storage is still unavailable.
      }
      throw new CreditCommitUncertainError(message);
    }
  }
};

export const creditBillingError = (task: Task) =>
  task.chargeStatus === "refused"
    ? {
        code: task.error?.split(":", 1)[0] ?? "credits_refused",
        message: task.error ?? "Credit spending was refused.",
        fundingUrl: "/wallet?buyCredits=1",
      }
    : undefined;
