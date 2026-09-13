import { EvmAddress, WatchlistInput } from "@froggy/domain";
import type { TaskId } from "@froggy/domain";
import type { ServiceCard, ServiceTicket } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@froggy/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@froggy/ui/components/input-group";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@froggy/ui/components/toggle-group";
import { Schema } from "effect";
import { ArrowRightIcon, EllipsisIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { formatCredits } from "../../lib/credit-view";
import { networkWords } from "../../lib/mandate-words";
import { useWatchlist, useWatchlistView } from "../../lib/watchlist-client";
import { SaveItem } from "./item-form";
import { MarketResults } from "./market-results";
import { ReminderForm } from "./reminder-form";

const searchPrice = (card: ServiceCard | undefined): string =>
  card === undefined
    ? "Loading price…"
    : `${card.status === "demo" ? "Simulated · " : ""}${formatCredits(card.priceCreditUnits ?? card.priceUsdMicros)}`;
const ticketPending = (ticket: ServiceTicket | null): boolean =>
  ticket !== null && ["quoted", "paid", "running"].includes(ticket.status);
const failureMessage = (
  errors: readonly (Error | null)[],
  note: string | null | undefined
): string | null =>
  errors.find((entry) => entry !== null)?.message ?? note ?? null;
const useTrackBar = (compact: boolean, autoFocus: boolean) => {
  const { track, capture, resolve } = useWatchlist();
  const view = useWatchlistView();
  const api = useServiceApi();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [network, setNetwork] = useState("eip155:8453");
  const [taskId, setTaskId] = useState<TaskId | null>(null);
  const [dialog, setDialog] = useState<"manual" | "reminder" | null>(null);
  const [failureNote, setFailureNote] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const card = api.catalog.data?.services.find(
    (entry) => entry.name === "market_search"
  );
  const networks = ["eip155:8453", "eip155:4663", "eip155:1"].filter(
    (entry) => card?.networks?.includes(entry) === true
  );
  const ticket =
    api.tasks.data?.tasks.find((task) => task.id === taskId) ??
    (api.run.data?.id === taskId ? api.run.data : null);
  const pending =
    track.isPending ||
    capture.isPending ||
    resolving ||
    api.run.isPending ||
    ticketPending(ticket);
  const price = searchPrice(card);
  useEffect(() => {
    if (autoFocus) {
      input.current?.focus();
    }
  }, [autoFocus]);
  const clear = () => {
    setValue("");
    view.update({ query: "" });
    input.current?.focus();
  };
  const search = (query: string | null) => {
    if (
      pending ||
      card === undefined ||
      card.status === "unavailable" ||
      !networks.includes(network)
    ) {
      return;
    }
    api.run.mutate(
      {
        v: 2,
        idempotencyKey: crypto.randomUUID(),
        service: "market_search",
        input: { network, query, limit: 12 },
      },
      {
        onSuccess: (task) => {
          setTaskId(task.id);
        },
      }
    );
  };
  const save = async (text: string) => {
    setFailureNote(null);
    if (Schema.is(EvmAddress)(text)) {
      track.mutate({ v: 1, address: text });
      clear();
      return;
    }
    if (/^https?:\/\//u.test(text)) {
      setResolving(true);
      try {
        const preview = await resolve({ v: 1, input: text });
        const candidate =
          preview.candidates[0] ??
          Schema.decodeUnknownSync(WatchlistInput)({
            title: new URL(text).hostname,
            notes: "",
            source: { _tag: "link", url: text },
          });
        await capture.mutateAsync({
          ...candidate,
          v: 2,
          previewRef: preview.ref,
          enrich: false,
          acceptedPrice: 0,
        });
        clear();
      } catch (error) {
        setFailureNote(
          error instanceof Error ? error.message : "Could not save this link."
        );
      }
      setResolving(false);
      return;
    }
    if (!compact && text !== "") {
      search(text);
    }
  };
  const failure = failureMessage(
    [track.error, capture.error, api.run.error],
    failureNote ?? ticket?.error
  );
  const result = ticket?.data;
  return {
    value,
    setValue,
    input,
    view,
    pending,
    save,
    card,
    dialog,
    setDialog,
    search,
    price,
    network,
    setNetwork,
    networks,
    taskId,
    failure,
    result,
  };
};
export const TrackBar = ({
  compact = false,
  autoFocus = false,
}: {
  readonly compact?: boolean;
  readonly autoFocus?: boolean;
}): ReactElement => {
  const {
    value,
    setValue,
    input,
    view,
    pending,
    save,
    card,
    dialog,
    setDialog,
    search,
    price,
    network,
    setNetwork,
    networks,
    taskId,
    failure,
    result,
  } = useTrackBar(compact, autoFocus);
  return (
    <section
      aria-label="Track an address or link"
      className="flex min-w-0 flex-col gap-3"
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save(value.trim());
        }}
      >
        <label className="sr-only" htmlFor="track-input">
          Address, link or token name
        </label>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            id="track-input"
            ref={input}
            autoComplete="off"
            maxLength={2048}
            placeholder="Paste an address or link, or search a token"
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              if (!compact) {
                view.update({ query: next });
              }
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text").trim();
              if (Schema.is(EvmAddress)(text) || /^https?:\/\//u.test(text)) {
                event.preventDefault();
                void save(text);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              className="size-11"
              size="icon-sm"
              type="submit"
              aria-label="Track or search"
              disabled={pending || value.trim() === ""}
            >
              <ArrowRightIcon aria-hidden />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {compact ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="More actions"
                />
              }
            >
              <EllipsisIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => {
                    setDialog("reminder");
                  }}
                >
                  Set a reminder
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => {
                    setDialog("manual");
                  }}
                >
                  Add something by hand
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  disabled={
                    pending ||
                    card === undefined ||
                    card.status === "unavailable"
                  }
                  onClick={() => {
                    search(null);
                  }}
                >
                  New listings · {price}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </form>
      {compact ? null : (
        <>
          <p className="text-muted-foreground text-xs">
            {value.trim() !== "" &&
            !Schema.is(EvmAddress)(value.trim()) &&
            !/^https?:\/\//u.test(value.trim())
              ? `Enter searches tokens on ${networkWords(network)} · ${price} per search`
              : "Free. Tokens and wallets on Ethereum, Base and Robinhood. Links from anywhere."}
          </p>
          {value.trim() !== "" || taskId !== null ? (
            <ToggleGroup
              aria-label="Search on"
              variant="outline"
              value={[network]}
              onValueChange={(values) => {
                if (values[0] !== undefined && values[0] !== "") {
                  setNetwork(values[0]);
                }
              }}
              className="flex-wrap"
            >
              {networks.map((entry) => (
                <ToggleGroupItem key={entry} value={entry} className="min-h-11">
                  {networkWords(entry)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <SaveItem
            open={dialog === "manual"}
            onOpenChange={(open) => {
              setDialog(open ? "manual" : null);
            }}
          />
          <ReminderForm
            open={dialog === "reminder"}
            onOpenChange={(open) => {
              setDialog(open ? "reminder" : null);
            }}
          />
          {result?.operation === "market_search" ||
          result?.operation === "token_inspect" ? (
            <MarketResults result={result} />
          ) : null}
        </>
      )}
      {failure !== undefined && failure !== null && failure !== "" ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}
    </section>
  );
};
