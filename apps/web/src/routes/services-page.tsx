/**
 * What the wallet can buy: fixed prices, a request, and the results to come
 * back to. The chosen service lives in the URL, so Back works and the chat
 * can point at one.
 */

import type { ServiceName } from "@froggy/protocol";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { ServiceCatalog } from "../components/services/service-catalog";
import { ServiceRequestForm } from "../components/services/service-request-form";
import { ServiceTaskList } from "../components/services/service-task-list";
import { useServiceApi } from "../hooks/use-service-api";

export const ServicesPage = (): ReactElement => {
  const { catalog, download, run, tasks } = useServiceApi();
  const search = useSearch({ from: "/workspace/services" });
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
  return (
    <Page
      intro="Fixed prices, paid from your wallet, with a result you can come back to."
      title="Services"
      wide
    >
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
            <ServiceRequestForm
              card={chosen}
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
    </Page>
  );
};
