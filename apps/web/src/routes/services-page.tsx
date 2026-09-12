import { formatUsd } from "@froggy/domain";
/**
 * What the wallet can buy: fixed prices, a request, and the results to come
 * back to. The chosen service lives in the URL, so Back works and the chat
 * can point at one.
 */
import type { ServiceName, TaskDetail } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import { DiscardedSearchNotice } from "../components/discarded-search-notice";
import { Page } from "../components/nav/page";
import { PurchasePanel } from "../components/purchases/purchase-panel";
import { LaunchWatchList } from "../components/services/launch-watch-list";
import { ServiceCatalog } from "../components/services/service-catalog";
import { ServiceRequestForm } from "../components/services/service-request-form";
import { ServiceTaskCard } from "../components/services/service-task-card";
import { ServiceTaskList } from "../components/services/service-task-list";
import { TradingServiceForm } from "../components/services/trading-service-form";
import { TradePanel } from "../components/trading/trade-panel";
import { useServiceApi } from "../hooks/use-service-api";

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
      {task.saleId === null ? null : (
        <span className="text-money text-sm">
          {formatUsd(task.priceUsdMicros)} paid
        </span>
      )}
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

export const ServicesPage = (): ReactElement => {
  const search = useSearch({ from: "/workspace/services" });
  const { api, catalog, download, run, tasks, selectedTask } = useServiceApi(
    search.task
  );
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusTasks = useRef(false);
  // Returning to the catalog moves the task list down on a phone. Focus only
  // after that layout exists, so the result stays in view.
  useEffect(() => {
    if (search.service !== undefined || !focusTasks.current) {
      return;
    }
    focusTasks.current = false;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [search.service]);
  const choose = (service: ServiceName | null): void => {
    void navigate({
      search: service === null ? {} : { service },
      to: "/services",
    });
  };
  const chosen =
    search.service === undefined
      ? null
      : (catalog.data?.services.find((card) => card.name === search.service) ??
        null);
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
  const RequestForm =
    chosen?.inputKind === "structured"
      ? TradingServiceForm
      : ServiceRequestForm;
  return (
    <Page
      intro="Fixed prices, paid from your wallet, with a result you can come back to."
      title="Services"
      wide
    >
      <DiscardedSearchNotice
        discarded={search.dropped === "1"}
        onDismiss={() => {
          const { service, task } = search;
          void navigate({
            replace: true,
            search: () => {
              if (service !== undefined && task !== undefined) {
                return { service, task };
              }
              if (service !== undefined) {
                return { service };
              }
              if (task !== undefined) {
                return { task };
              }
              return {};
            },
            to: "/services",
          });
        }}
        what="The named service"
      />
      {search.task === undefined ? null : (
        <section
          aria-label="Selected service task"
          className="flex flex-col gap-3"
        >
          <h2 className="text-section">Task {search.task}</h2>
          {selectedTask.isPending ? <p>Loading task…</p> : null}
          {selectedTask.isError ? (
            <p role="alert">Couldn’t load this task.</p>
          ) : null}
          {taskResult}
        </section>
      )}
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {chosen === null ? (
            <ServiceCatalog
              catalog={catalog}
              onChoose={(card) => {
                choose(card.name);
              }}
              selected={search.service ?? null}
            />
          ) : (
            <RequestForm
              card={chosen}
              key={chosen.name}
              onBack={() => {
                choose(null);
              }}
              onStarted={() => {
                focusTasks.current = true;
                choose(null);
              }}
              run={run}
            />
          )}
        </div>
        <ServiceTaskList
          catalog={catalog.data?.services ?? []}
          download={download}
          headingRef={headingRef}
          tasks={tasks}
        />
      </div>
      <LaunchWatchList api={api} />
      <TradePanel />
      <PurchasePanel />
    </Page>
  );
};
