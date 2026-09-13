/** One task named in the URL, with its result: a service ticket, a brief or a browse. */

import { formatUsd } from "@froggy/domain";
import type { TaskDetail } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { useSearch } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";
import { creditChargeWords, formatCredits } from "../../lib/credit-view";
import { ServiceTaskCard } from "../services/service-task-card";

const DelegatedTaskResult = ({
  task,
}: {
  readonly task: Exclude<TaskDetail["task"], { kind: "service" }>;
}): ReactElement => (
  <div className="bg-card shadow-card flex flex-col gap-3 rounded-2xl p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-medium">
        {task.kind === "brief" ? "Lending brief" : "Browser task"}
      </h3>
      <Badge variant="secondary">{task.status.replaceAll("_", " ")}</Badge>
      {task.kind === "brief" && task.result?.stubbed === true ? (
        <Badge variant="outline">Simulated</Badge>
      ) : null}
      {task.priceCreditUnits === undefined ? null : (
        <span className="text-money text-sm">
          {formatCredits(task.priceCreditUnits)}{" "}
          {creditChargeWords(task.chargeStatus)}
        </span>
      )}
      {task.priceCreditUnits === undefined && task.saleId !== null ? (
        <span className="text-money text-sm">
          {formatUsd(task.priceUsdMicros)} paid
        </span>
      ) : null}
    </div>
    {task.error === null ? null : <p role="alert">{task.error}</p>}
    {task.result === null ? null : (
      <div className="flex flex-col gap-2 text-sm whitespace-pre-wrap">
        {task.kind === "brief" ? (
          <>
            <p>{task.result.cheapestBorrow}</p>
            <p>{task.result.bestSupply}</p>
          </>
        ) : (
          <p>{task.result.text}</p>
        )}
      </div>
    )}
  </div>
);

export const SelectedTask = ({
  selectedTask,
  catalog,
  download,
}: Pick<
  ServiceApi,
  "selectedTask" | "catalog" | "download"
>): ReactElement | null => {
  const search = useSearch({ from: "/workspace/activity" });
  if (search.task === undefined) {
    return null;
  }
  const chosenTask = selectedTask.data?.task;
  let taskResult: ReactElement | null = null;
  if (chosenTask !== undefined) {
    taskResult =
      chosenTask.kind === "service" ? (
        <ServiceTaskCard
          catalog={catalog.data?.services ?? []}
          download={download}
          task={chosenTask.result}
        />
      ) : (
        <DelegatedTaskResult task={chosenTask} />
      );
  }
  return (
    <section aria-label="Selected service task" className="flex flex-col gap-3">
      <h3 className="text-section">Task {search.task}</h3>
      {selectedTask.isPending ? <p>Loading task…</p> : null}
      {selectedTask.isError ? (
        <p role="alert">Couldn’t load this task.</p>
      ) : null}
      {taskResult}
    </section>
  );
};
