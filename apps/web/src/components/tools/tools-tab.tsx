/**
 * The price list. Every tool Froggy offers, grouped by what a person wants
 * done, with its price in credits, whether it is real on this build, and
 * what this person has already used. A priced row folds open to the form
 * that runs it by hand; the rest is done by asking Froggy or an agent.
 */

import type {
  ServiceCard,
  ToolCatalogEntry,
  ToolCatalogGroup,
} from "@froggy/protocol";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  BookmarkIcon,
  ChartNoAxesCombinedIcon,
  ClockIcon,
  CoinsIcon,
  CompassIcon,
  GlobeIcon,
  MailIcon,
  SearchIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createElement, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import type { ServiceApi } from "../../hooks/use-service-api";
import { useToolCatalog } from "../../hooks/use-tool-catalog";
import { useTrades } from "../../hooks/use-trades";
import { creditNumber, formatCredits } from "../../lib/credit-view";
import { readinessBadge, serviceIcon } from "../../lib/services-view";
import { useWorkspace } from "../../lib/workspace-context";
import { PurchasePanel } from "../purchases/purchase-panel";
import { LaunchWatchList } from "../services/launch-watch-list";
import { ServiceRequestForm } from "../services/service-request-form";
import { ServiceTaskList } from "../services/service-task-list";
import { TradingServiceForm } from "../services/trading-service-form";
import { TradeReview } from "../trading/trade-review";
import { SelectedTask } from "./selected-task";

const GROUP_ICONS: ReadonlyMap<string, LucideIcon> = new Map([
  ["research", SearchIcon],
  ["tokens", CoinsIcon],
  ["create", SparklesIcon],
  ["browse", GlobeIcon],
  ["email", MailIcon],
  ["watch", BookmarkIcon],
  ["reminders", ClockIcon],
  ["trading", ChartNoAxesCombinedIcon],
  ["pay", WalletIcon],
  ["froggy", CompassIcon],
]);

const priceWords = (price: ToolCatalogEntry["price"]): string => {
  switch (price.kind) {
    case "credits": {
      return formatCredits(price.units);
    }
    case "budget": {
      const [low, high] = [
        Math.min(...price.options),
        Math.max(...price.options),
      ];
      return `${creditNumber(low)}–${creditNumber(high)} credits`;
    }
    case "wallet": {
      return "Wallet";
    }
    case "included": {
      return "Included";
    }
  }
  throw new Error("Unsupported tool price.");
};

const sinceWords = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  return days < 14 ? `${days} d ago` : new Date(at).toLocaleDateString();
};

const usageWords = (usage: ToolCatalogEntry["usage"], now: number): string => {
  if (usage.calls === 0 || usage.lastAt === null) {
    return "Not used yet";
  }
  const calls = `${usage.calls} ${usage.calls === 1 ? "call" : "calls"}`;
  const credits =
    usage.creditUnits > 0 ? ` · ${formatCredits(usage.creditUnits)} used` : "";
  return `${calls}${credits} · ${sinceWords(usage.lastAt, now)}`;
};

/** The catalogue's three words map onto the card statuses the badge already knows. */
const READINESS: Record<
  ToolCatalogEntry["availability"],
  ServiceCard["status"]
> = { ready: "configured", simulated: "demo", unavailable: "unavailable" };
const availabilityBadge = (availability: ToolCatalogEntry["availability"]) =>
  readinessBadge(READINESS[availability]);

/** The form a priced row folds open to; null when nothing here can run it by hand. */
const RowForm = ({
  card,
  onClose,
  onStarted,
  run,
  tool,
}: {
  readonly card: ServiceCard | undefined;
  readonly onClose: () => void;
  readonly onStarted: () => void;
  readonly run: ServiceApi["run"];
  readonly tool: ToolCatalogEntry;
}): ReactElement | null => {
  if (tool.name === "x402_fetch") {
    return <PurchasePanel />;
  }
  if (card === undefined || card.status === "unavailable") {
    return null;
  }
  if (card.inputKind === "structured") {
    return (
      <TradingServiceForm
        card={card}
        onBack={onClose}
        onStarted={onStarted}
        run={run}
      />
    );
  }
  return (
    <ServiceRequestForm
      card={card}
      onBack={onClose}
      onStarted={onStarted}
      run={run}
    />
  );
};

/** The row a link asked to open: the x402 row answers to its old name. */
const initialOpen = (service: string | undefined): string | null => {
  if (service === undefined) {
    return null;
  }
  return service === "pay_url" ? "x402_fetch" : service;
};

const runnable = (tool: ToolCatalogEntry, card: ServiceCard | undefined) =>
  tool.name === "x402_fetch" ||
  (card !== undefined && card.status !== "unavailable");

const ToolRow = ({
  card,
  fallbackIcon,
  now,
  open,
  onOpenChange,
  onStarted,
  run,
  tool,
}: {
  readonly card: ServiceCard | undefined;
  /** The group's icon, for a tool with no card of its own. */
  readonly fallbackIcon: LucideIcon;
  readonly now: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStarted: () => void;
  readonly run: ServiceApi["run"];
  readonly tool: ToolCatalogEntry;
}): ReactElement => {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (open) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [open]);
  const readiness = availabilityBadge(tool.availability);
  const canRun = runnable(tool, card);
  const title = card?.title ?? tool.title;
  return (
    <li className="flex flex-col" data-tool={tool.name} ref={ref}>
      <div className="flex items-start gap-3 py-3">
        {card === undefined ? (
          <span
            aria-hidden
            className="bg-muted text-muted-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
          >
            {createElement(fallbackIcon, { className: "size-4 opacity-70" })}
          </span>
        ) : (
          <span className="bg-brand-soft text-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
            {createElement(serviceIcon(card.name), {
              "aria-hidden": true,
              className: "size-4",
            })}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="font-medium">{title}</span>
            <span
              aria-hidden
              className="border-border mb-1.5 min-w-4 flex-1 self-end border-b border-dotted"
            />
            <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              {priceWords(tool.price)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm text-pretty">
            {card?.description ?? tool.description}
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="tabular-nums">{usageWords(tool.usage, now)}</span>
            <Badge className={readiness.className} variant="outline">
              {readiness.label}
            </Badge>
            {tool.surfaces.includes("mcp") ? (
              <Badge variant="outline">Agents</Badge>
            ) : null}
            {canRun ? (
              <Button
                aria-controls={`tool-form-${tool.name}`}
                aria-expanded={open}
                aria-label={`Choose ${title.toLowerCase()}`}
                className="ml-auto"
                onClick={() => {
                  onOpenChange(!open);
                }}
                size="xs"
                variant={open ? "secondary" : "outline"}
              >
                {open ? "Close" : "Run it yourself"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {open ? (
        <div className="pb-4" id={`tool-form-${tool.name}`}>
          <RowForm
            card={card}
            onClose={() => {
              onOpenChange(false);
            }}
            onStarted={onStarted}
            run={run}
            tool={tool}
          />
        </div>
      ) : null}
    </li>
  );
};

const TradeHistory = (): ReactElement => {
  const { app } = useWorkspace();
  const api = useTrades(app.sessionId);
  return (
    <section
      aria-label="Trade history"
      className="flex min-w-0 flex-col gap-3 pt-4"
    >
      <h4 className="font-medium">Trade history</h4>
      {api.trades.isError ? (
        <Alert>
          <AlertTitle>Could not load trades</AlertTitle>
          <AlertDescription>{api.trades.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {api.trades.data?.trades.length === 0 ? (
        <Empty className="flex-none py-[26px]">
          <EmptyHeader>
            <EmptyTitle>No trades yet</EmptyTitle>
            <EmptyDescription>
              Ask Froggy or a connected agent to prepare one. You approve each
              step here or in Activity.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {api.trades.data?.trades.map((trade) => (
        <TradeReview api={api} key={trade.id} trade={trade} />
      ))}
    </section>
  );
};

const GroupSection = ({
  api,
  cards,
  group,
  now,
  onStarted,
  open,
  run,
  setOpen,
}: {
  readonly api: ServiceApi["api"];
  readonly cards: readonly ServiceCard[];
  readonly group: ToolCatalogGroup;
  readonly now: number;
  readonly onStarted: () => void;
  readonly open: string | null;
  readonly run: ServiceApi["run"];
  readonly setOpen: (name: string | null) => void;
}): ReactElement => (
  <section
    aria-labelledby={`tools-${group.id}`}
    className="flex min-w-0 flex-col gap-2"
  >
    <header className="flex items-start gap-3">
      {createElement(GROUP_ICONS.get(group.id) ?? CompassIcon, {
        "aria-hidden": true,
        className: "text-brand mt-1 size-5 shrink-0",
      })}
      <div>
        <h3 className="text-section" id={`tools-${group.id}`}>
          {group.title}
        </h3>
        <p className="text-muted-foreground text-sm">{group.description}</p>
      </div>
    </header>
    <ul className="divide-border divide-y">
      {group.tools.map((tool) => (
        <ToolRow
          card={cards.find((card) => card.name === tool.name)}
          fallbackIcon={GROUP_ICONS.get(group.id) ?? CompassIcon}
          key={tool.name}
          now={now}
          onOpenChange={(next) => {
            setOpen(next ? tool.name : null);
          }}
          onStarted={onStarted}
          open={open === tool.name}
          run={run}
          tool={tool}
        />
      ))}
    </ul>
    {group.id === "tokens" ? <LaunchWatchList api={api} /> : null}
    {group.id === "trading" ? <TradeHistory /> : null}
  </section>
);

export const ToolsTab = (): ReactElement => {
  const search = useSearch({ from: "/workspace/activity" });
  const navigate = useNavigate();
  const catalog = useToolCatalog();
  const services = useServiceApi(search.task);
  const now = catalog.data?.fetchedAt ?? 0;
  const [open, setOpen] = useState<string | null>(() =>
    initialOpen(search.service)
  );
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const cards = services.catalog.data?.services ?? [];
  const onStarted = () => {
    setOpen(null);
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start" });
  };
  const chooseRow = (name: string | null) => {
    setOpen(name);
    if (search.service !== undefined) {
      void navigate({
        replace: true,
        search:
          search.task === undefined
            ? { tab: "tools" }
            : { tab: "tools", task: search.task },
        to: "/activity",
      });
    }
  };
  return (
    <div className="flex flex-col gap-8">
      <h2 className="sr-only">Tools</h2>
      <SelectedTask
        catalog={services.catalog}
        download={services.download}
        selectedTask={services.selectedTask}
      />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-10">
          {catalog.isPending ? (
            <output aria-label="Loading tools" className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </output>
          ) : null}
          {catalog.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t load the tools.</AlertTitle>
              <AlertDescription>{catalog.error.message}</AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => {
                    void catalog.refetch();
                  }}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {catalog.data?.groups.map((group) => (
            <GroupSection
              api={services.api}
              cards={cards}
              group={group}
              key={group.id}
              now={now}
              onStarted={onStarted}
              open={open}
              run={services.run}
              setOpen={chooseRow}
            />
          ))}
        </div>
        <ServiceTaskList
          catalog={cards}
          download={services.download}
          headingRef={headingRef}
          tasks={services.tasks}
        />
      </div>
    </div>
  );
};
