import { EvmAddress } from "@froggy/domain";
import type { TaskId } from "@froggy/domain";
import type { ServiceCard, ServiceTicket } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Schema } from "effect";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { formatCredits } from "../../lib/credit-view";
import { networkWords } from "../../lib/mandate-words";
import { MarketResults } from "./market-results";

const lookupLabel = (pending: boolean, mode: "search" | "new"): string => {
  if (pending) {
    return "Looking…";
  }
  return mode === "new" ? "Load new listings" : "Look up";
};
const unavailable = (
  pending: boolean,
  network: string,
  card: ServiceCard | undefined,
  empty: boolean
): boolean =>
  pending ||
  network === "" ||
  card === undefined ||
  card.status === "unavailable" ||
  empty;
const lookupPrice = (card: ServiceCard | undefined): string => {
  if (card === undefined) {
    return "Loading sources…";
  }
  return `${card.status === "demo" ? "Simulated · " : ""}${formatCredits(card.priceCreditUnits ?? card.priceUsdMicros)} per lookup · credit limits apply`;
};
const LookupResult = ({
  ticket,
}: {
  readonly ticket: ServiceTicket | null | undefined;
}): ReactElement | null => {
  if (
    ticket !== null &&
    ticket !== undefined &&
    ticket.error !== null &&
    ticket.error !== ""
  ) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {ticket.error}
      </p>
    );
  }
  const result = ticket?.data;
  return result?.operation === "market_search" ||
    result?.operation === "token_inspect" ? (
    <MarketResults result={result} />
  ) : null;
};

export const TokenDiscovery = (): ReactElement => {
  const api = useServiceApi();
  const [mode, setMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [network, setNetwork] = useState("");
  const [taskId, setTaskId] = useState<TaskId | null>(null);
  const inspect = mode === "search" && Schema.is(EvmAddress)(query.trim());
  const service = inspect ? "token_inspect" : "market_search";
  const card = api.catalog.data?.services.find(
    (entry) => entry.name === service
  );
  const networks =
    card?.networks?.filter((value) => value.startsWith("eip155:")) ?? [];
  const ticket =
    api.tasks.data?.tasks.find((task) => task.id === taskId) ??
    (api.run.data?.id === taskId ? api.run.data : null);
  const pending =
    api.run.isPending ||
    (ticket !== null && ["quoted", "paid", "running"].includes(ticket.status));
  return (
    <section
      aria-label="Discover tokens"
      className="bg-card border-border flex flex-col gap-4 rounded-2xl border p-4 sm:p-5"
    >
      <div>
        <h2 className="font-medium">Find your next rabbit hole</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Research a name or address, or see what just launched.
        </p>
      </div>
      <fieldset className="flex gap-2" aria-label="Discovery mode">
        <Button
          variant="outline"
          aria-pressed={mode === "search"}
          onClick={() => {
            setMode("search");
          }}
        >
          Search
        </Button>
        <Button
          variant="outline"
          aria-pressed={mode === "new"}
          onClick={() => {
            setMode("new");
          }}
        >
          New listings
        </Button>
      </fieldset>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            network === "" ||
            pending ||
            (mode === "search" && query.trim() === "")
          ) {
            return;
          }
          const shared = { v: 2 as const, idempotencyKey: crypto.randomUUID() };
          const input = inspect
            ? {
                ...shared,
                service: "token_inspect" as const,
                input: { network, address: query.trim() },
              }
            : {
                ...shared,
                service: "market_search" as const,
                input: {
                  network,
                  query: mode === "new" ? null : query.trim(),
                  limit: 12,
                },
              };
          api.run.mutate(input, {
            onSuccess: (task) => {
              setTaskId(task.id);
            },
          });
        }}
      >
        <FieldGroup className="sm:flex-row sm:items-end">
          <Field className={mode === "new" ? "hidden" : "sm:flex-1"}>
            <FieldLabel htmlFor="token-query">
              Name, symbol or address
            </FieldLabel>
            <Input
              id="token-query"
              maxLength={120}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Search tokens…"
            />
          </Field>
          <Field className="sm:w-auto">
            <FieldLabel htmlFor="token-chain">Chain</FieldLabel>
            <NativeSelect
              id="token-chain"
              value={network}
              onChange={(event) => {
                setNetwork(event.target.value);
              }}
              required
            >
              <NativeSelectOption value="">Choose chain</NativeSelectOption>
              {networks.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {networkWords(value)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{lookupPrice(card)}</p>
          <Button
            disabled={unavailable(
              pending,
              network,
              card,
              mode === "search" && query.trim() === ""
            )}
            type="submit"
            variant="outline"
          >
            <SearchIcon data-icon="inline-start" />
            {lookupLabel(pending, mode)}
          </Button>
        </div>
      </form>
      {api.catalog.isError ? (
        <p role="alert" className="text-destructive text-sm">
          Sources could not be loaded.{" "}
          <Button
            variant="ghost"
            onClick={() => {
              void api.catalog.refetch();
            }}
          >
            Retry
          </Button>
        </p>
      ) : null}
      {api.run.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {api.run.error.message}
        </p>
      ) : null}
      <LookupResult ticket={ticket} />
    </section>
  );
};
