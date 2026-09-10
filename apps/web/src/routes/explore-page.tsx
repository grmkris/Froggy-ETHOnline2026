/**
 * Explore: look things up and act on them, without writing a sentence first.
 *
 * Services, scheduled work and past activity used to be three destinations.
 * They are one destination here, because a place per kind of content is how a
 * workspace turns into a dashboard. Nothing was removed: the old routes still
 * resolve, so a bookmark or a deep link keeps working — they simply stopped
 * being top-level.
 *
 * Choosing a service hands off to /services, which owns the request form, the
 * quote and the receipt. Explore is for finding a thing; the page that already
 * buys it correctly keeps buying it.
 */

import type { ServiceName } from "@froggy/protocol";
import { Tabs, TabsList, TabsTrigger } from "@froggy/ui/components/tabs";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";

import { Page } from "../components/nav/page";
import { ServiceCatalog } from "../components/services/service-catalog";
import { ScheduleList } from "../components/settings/schedule-list";
import { useServiceApi } from "../hooks/use-service-api";

type Tab = "services" | "watching";

export const ExplorePage = (): ReactElement => {
  const [tab, setTab] = useState<Tab>("services");
  const { catalog } = useServiceApi();
  const navigate = useNavigate();

  const open = (service: ServiceName): void => {
    void navigate({ search: { service }, to: "/services" });
  };

  return (
    <Page
      intro="What Froggy can use, and what it is doing on a schedule."
      slot="explore-page"
      title="Explore"
      wide
    >
      <Tabs
        onValueChange={(value) => {
          setTab(value === "watching" ? "watching" : "services");
        }}
        value={tab}
      >
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="watching">Watching</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "services" ? (
        <ServiceCatalog
          catalog={catalog}
          onChoose={(card) => {
            open(card.name);
          }}
          selected={null}
        />
      ) : (
        <ScheduleList />
      )}
      <p className="text-muted-foreground text-sm">
        Everything that already happened, with its receipts, is in{" "}
        <Link className="text-brand underline" to="/activity">
          Activity
        </Link>
        .
      </p>
    </Page>
  );
};
