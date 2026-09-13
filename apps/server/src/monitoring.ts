import { MonitorCheckId, MonitorId, monitorMatches } from "@froggy/domain";
import type {
  AgentConnectionId,
  Monitor,
  MonitorCheck,
  MonitorConfig,
  MonitorObservation,
  MonitoringBook,
  UserId,
  WatchlistItem,
} from "@froggy/domain";
import type { Store } from "@froggy/wallet";

import { isTimezone, localClock, nextRunAfter } from "./schedules";

/** The existing $1 browser quote bounds a check; websites cannot buy extras. */
export const MONITOR_CHECK_USD_MICROS = 1_000_000;
export const monitoringMonth = (now: number, timezone: string): string =>
  localClock(now, timezone).day.slice(0, 7);
const monitorNextAt = (config: MonitorConfig, now: number): number => {
  if (config.cadence === "hourly") {
    return now + 3_600_000;
  }
  const local = localClock(now, config.timezone);
  const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  return (
    nextRunAfter(
      config.cadence === "daily"
        ? { _tag: "daily", time }
        : { _tag: "weekly", weekday: local.weekday, time },
      config.timezone,
      now
    ) ?? now + 86_400_000
  );
};

export const monitoringState = async (
  store: Store,
  owner: UserId
): Promise<MonitoringBook> =>
  await store.monitoring.transact(owner, (book) => ({ book, result: book }));

/** Recheck the saved revision at the payment boundary, after asynchronous quoting. */
export const assertMonitorCurrent = async (
  store: Store,
  owner: UserId,
  check: MonitorCheck
): Promise<void> => {
  const current = await monitoringState(store, owner);
  const monitor = current.monitors.find(
    (entry) => entry.id === check.monitorId
  );
  if (
    !monitor ||
    monitor.status !== "checking" ||
    monitor.revision !== check.revision ||
    monitor.checkId !== check.id
  ) {
    throw new Error(
      "The monitor was paused or changed. Nothing was purchased."
    );
  }
};

export const configureMonitor = async (
  store: Store,
  owner: UserId,
  input: MonitorConfig,
  connectionId: AgentConnectionId | null,
  now = Date.now()
): Promise<Monitor> => {
  if (!isTimezone(input.timezone)) {
    throw new Error("Choose a valid timezone.");
  }
  const item = await store.watchlist.transact(owner, (book) =>
    book.get(input.itemId)
  );
  if (!item || item.archived) {
    throw new Error("Save an active item before configuring monitoring.");
  }
  return await store.monitoring.transact(owner, (book) => {
    if (book.budget.monthlyUsdMicros < MONITOR_CHECK_USD_MICROS) {
      throw new Error(
        "Set a monthly monitoring budget in Watchlist first. Agents cannot change this budget."
      );
    }
    const existing = book.monitors.find(
      (entry) => entry.itemId === input.itemId
    );
    if (
      existing &&
      book.checks.some(
        (check) =>
          check.monitorId === existing.id && check.status === "uncertain"
      )
    ) {
      throw new Error(
        "Reconcile the interrupted payment before changing this monitor."
      );
    }
    if (existing?.status === "checking" || existing?.status === "needs_help") {
      throw new Error(
        "Finish or pause the current check before editing this monitor."
      );
    }
    const monitor: Monitor = {
      ...input,
      v: 1,
      id: existing?.id ?? MonitorId.generate(),
      connectionId,
      revision: (existing?.revision ?? 0) + 1,
      status: "scheduled",
      nextAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      baseline: null,
      latest: null,
      matched: false,
      error: null,
      checkId: null,
    };
    return {
      book: {
        ...book,
        monitors: [
          ...book.monitors.filter((entry) => entry.id !== monitor.id),
          monitor,
        ],
      },
      result: monitor,
    };
  });
};

export const setMonitoringBudget = async (
  store: Store,
  owner: UserId,
  monthlyUsdMicros: number,
  timezone: string
) => {
  if (!isTimezone(timezone)) {
    throw new Error("Choose a valid timezone.");
  }
  return await store.monitoring.transact(owner, (book) => {
    if (book.checks.length > 0 && book.budget.timezone !== timezone) {
      throw new Error(
        "The budget timezone is fixed after the first check so changing it cannot reset spending."
      );
    }
    const updated = { ...book, budget: { monthlyUsdMicros, timezone } };
    return { book: updated, result: updated.budget };
  });
};

export const changeMonitor = async (
  store: Store,
  owner: UserId,
  id: MonitorId,
  action: "pause" | "resume" | "check",
  now = Date.now()
) =>
  await store.monitoring.transact(owner, (book) => {
    const monitor = book.monitors.find((entry) => entry.id === id);
    if (!monitor) {
      throw new Error("Monitor not found.");
    }
    if (
      action !== "pause" &&
      book.checks.some(
        (check) => check.monitorId === id && check.status === "uncertain"
      )
    ) {
      throw new Error(
        "This check has an unconfirmed payment. It must be reconciled before another check can run."
      );
    }
    if (action !== "pause" && monitor.status === "checking") {
      throw new Error("This item is already being checked.");
    }
    const updated: Monitor = {
      ...monitor,
      status: action === "pause" ? "paused" : "scheduled",
      nextAt: now,
      updatedAt: now,
      error: null,
    };
    return {
      book: {
        ...book,
        monitors: book.monitors.map((entry) =>
          entry.id === id ? updated : entry
        ),
      },
      result: updated,
    };
  });

/** Item edits invalidate in-flight comparisons and require a fresh baseline. */
export const invalidateItemMonitor = async (
  store: Store,
  owner: UserId,
  item: WatchlistItem
): Promise<void> => {
  await store.monitoring.transact(owner, (book) => ({
    book: {
      ...book,
      monitors: book.monitors.map((monitor) =>
        monitor.itemId === item.id
          ? {
              ...monitor,
              revision: monitor.revision + 1,
              status: "paused" as const,
              context: `${item.title} ${item.notes}`.trim().slice(0, 1000),
              baseline: null,
              latest: null,
              matched: false,
              checkId: null,
              updatedAt: Date.now(),
              error:
                "Saved item changed. Review the check settings before resuming.",
            }
          : monitor
      ),
    },
    result: undefined,
  }));
};

/** Continue the same paid task under the owner lock; never reserve or buy again. */
export const claimMonitorContinuation = async (
  store: Store,
  owner: UserId,
  id: MonitorId
): Promise<MonitorCheck | null> =>
  await store.monitoring.transact(owner, (book) => {
    const monitor = book.monitors.find(
      (entry) => entry.id === id && entry.status === "scheduled"
    );
    const check = book.checks.find(
      (entry) =>
        entry.id === monitor?.checkId &&
        entry.revision === monitor?.revision &&
        entry.status === "needs_help"
    );
    if (
      !check ||
      !check.taskId ||
      book.checks.some((entry) =>
        ["running", "reserved"].includes(entry.status)
      )
    ) {
      return { book, result: null };
    }
    const updated: MonitorCheck = {
      ...check,
      status: "running",
      updatedAt: Date.now(),
    };
    return {
      book: {
        ...book,
        checks: book.checks.map((entry) =>
          entry.id === check.id ? updated : entry
        ),
        monitors: book.monitors.map((entry) =>
          entry.id === id ? { ...entry, status: "checking" as const } : entry
        ),
      },
      result: updated,
    };
  });

/** One owner lock covers the due claim and the entire month's reservations. */
export const claimMonitor = async (
  store: Store,
  owner: UserId,
  now = Date.now()
): Promise<MonitorCheck | null> =>
  await store.monitoring.transact(owner, (book) => {
    const month = monitoringMonth(now, book.budget.timezone);
    if (
      book.checks.some(
        (entry) => entry.status === "running" || entry.status === "reserved"
      )
    ) {
      return { book, result: null };
    }
    const monitor = book.monitors.find(
      (entry) =>
        ["scheduled", "budget_exhausted"].includes(entry.status) &&
        entry.nextAt <= now
    );
    if (!monitor) {
      return { book, result: null };
    }
    const spent =
      book.months.find((entry) => entry.month === month)?.spentUsdMicros ?? 0;
    const held = book.checks
      .filter((entry) => entry.month === month)
      .reduce((sum, entry) => sum + entry.reservedUsdMicros, 0);
    if (
      spent + held + MONITOR_CHECK_USD_MICROS >
      book.budget.monthlyUsdMicros
    ) {
      return {
        book: {
          ...book,
          monitors: book.monitors.map((entry) =>
            entry.id === monitor.id
              ? {
                  ...entry,
                  status: "budget_exhausted" as const,
                  error: "Monthly monitoring budget exhausted.",
                }
              : entry
          ),
        },
        result: null,
      };
    }
    const retained = book.checks.filter(
      (entry) =>
        entry.reservedUsdMicros > 0 ||
        !["done", "failed"].includes(entry.status)
    );
    const completed = book.checks
      .filter((entry) => !retained.includes(entry))
      .slice(-Math.max(0, 999 - retained.length));
    if (retained.length >= 999) {
      throw new Error("Resolve uncertain checks before starting another.");
    }
    const check: MonitorCheck = {
      v: 1,
      id: MonitorCheckId.generate(),
      monitorId: monitor.id,
      revision: monitor.revision,
      month,
      createdAt: now,
      updatedAt: now,
      reservedUsdMicros: MONITOR_CHECK_USD_MICROS,
      spentUsdMicros: 0,
      status: "reserved",
      taskId: null,
      observation: null,
      error: null,
      alert: null,
      notifiedAt: null,
    };
    return {
      book: {
        ...book,
        checks: [...completed, ...retained, check],
        monitors: book.monitors.map((entry) =>
          entry.id === monitor.id
            ? {
                ...entry,
                status: "checking" as const,
                checkId: check.id,
                updatedAt: now,
              }
            : entry
        ),
      },
      result: check,
    };
  });

export const updateMonitorCheck = async (
  store: Store,
  owner: UserId,
  id: MonitorCheckId,
  patch: Partial<
    Pick<MonitorCheck, "taskId" | "status" | "error" | "notifiedAt">
  >
): Promise<void> => {
  await store.monitoring.transact(owner, (book) => {
    const check = book.checks.find((entry) => entry.id === id);
    if (!check || ["done", "failed"].includes(check.status)) {
      return { book, result: undefined };
    }
    const uncertain = patch.status === "uncertain";
    const error =
      patch.error ??
      "The check was interrupted. Payment needs reconciliation before retrying.";
    let updated: MonitorCheck = { ...check, ...patch, updatedAt: Date.now() };
    if (uncertain) {
      updated = { ...updated, alert: error, notifiedAt: null };
    }
    return {
      book: {
        ...book,
        checks: book.checks.map((entry) => (entry.id === id ? updated : entry)),
        monitors: uncertain
          ? book.monitors.map((entry) =>
              entry.id === check.monitorId &&
              entry.revision === check.revision &&
              entry.status !== "paused"
                ? { ...entry, status: "needs_help" as const, error }
                : entry
            )
          : book.monitors,
      },
      result: undefined,
    };
  });
};

const checkStatus = (
  needsHelp: boolean,
  error: string | null
): MonitorCheck["status"] => {
  if (needsHelp) {
    return "needs_help";
  }
  return error === null ? "done" : "failed";
};
const monitorStatus = (
  current: boolean,
  monitor: Monitor,
  needsHelp: boolean,
  error: string | null
): Monitor["status"] => {
  if (!current) {
    return monitor.status;
  }
  if (needsHelp) {
    return "needs_help";
  }
  return error === null ? "scheduled" : "failed";
};
const checkAlert = (
  notify: boolean,
  observation: MonitorObservation | null,
  needsHelp: boolean,
  error: string | null
): string | null => {
  if (notify && observation) {
    return `Watchlist update: ${observation.value}. ${observation.evidence}`;
  }
  if (needsHelp) {
    return `Your watchlist check needs help: ${error ?? "Open Froggy to continue."}`;
  }
  return error === null ? null : `Your watchlist check stopped: ${error}`;
};

const validatedObservation = (
  monitor: Monitor,
  observation: MonitorObservation | null,
  error: string | null
) => {
  if (error !== null) {
    return { observation: null, error, sameMode: true };
  }
  const { condition } = monitor;
  if (
    observation &&
    (condition._tag === "price_below" || condition._tag === "price_drop") &&
    (observation.currency !== condition.currency || observation.price === null)
  ) {
    return {
      observation: null,
      error:
        "The source did not establish a price in the configured currency. The baseline is unchanged.",
      sameMode: true,
    };
  }
  return {
    observation,
    error,
    sameMode:
      !observation ||
      !monitor.baseline ||
      observation.stubbed === monitor.baseline.stubbed,
  };
};

export const finishMonitorCheck = async (
  store: Store,
  owner: UserId,
  id: MonitorCheckId,
  inputObservation: MonitorObservation | null,
  inputSpentUsdMicros: number,
  inputError: string | null,
  needsHelp = false,
  creditBilling = false
) =>
  await store.monitoring.transact(owner, (book) => {
    const check = book.checks.find((entry) => entry.id === id);
    if (!check || ["done", "failed"].includes(check.status)) {
      return { book, result: null };
    }
    const monitor = book.monitors.find((entry) => entry.id === check.monitorId);
    if (!monitor) {
      throw new Error("Monitor not found.");
    }
    const { observation, error, sameMode } = validatedObservation(
      monitor,
      inputObservation,
      inputError
    );
    const spentUsdMicros =
      creditBilling && observation === null ? 0 : inputSpentUsdMicros;
    const current =
      monitor.revision === check.revision && monitor.status !== "paused";
    const matched =
      current &&
      sameMode &&
      observation !== null &&
      monitorMatches(monitor, observation);
    const notify =
      matched && (!monitor.matched || monitor.condition._tag === "change");
    const now = Date.now();
    const result: MonitorCheck = {
      ...check,
      observation,
      error,
      status: checkStatus(needsHelp, error),
      reservedUsdMicros: 0,
      spentUsdMicros,
      updatedAt: now,
      alert: checkAlert(
        notify,
        observation,
        needsHelp && current,
        current ? error : null
      ),
      notifiedAt: null,
    };
    const delta = Math.max(0, spentUsdMicros - check.spentUsdMicros);
    const prior =
      book.months.find((entry) => entry.month === check.month)
        ?.spentUsdMicros ?? 0;
    const updated: Monitor = {
      ...monitor,
      status: monitorStatus(current, monitor, needsHelp, error),
      nextAt: monitorNextAt(monitor, now),
      updatedAt: now,
      error,
      baseline: sameMode ? (monitor.baseline ?? observation) : observation,
      latest: observation ?? monitor.latest,
      matched,
    };
    return {
      book: {
        ...book,
        months: [
          ...book.months.filter((entry) => entry.month !== check.month),
          { month: check.month, spentUsdMicros: prior + delta },
        ],
        monitors: book.monitors.map((entry) =>
          entry.id === monitor.id && current ? updated : entry
        ),
        checks: book.checks.map((entry) => (entry.id === id ? result : entry)),
      },
      result,
    };
  });
