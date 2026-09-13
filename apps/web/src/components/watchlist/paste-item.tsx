import { EvmAddress, WatchlistInput } from "@froggy/domain";
import type { WatchlistItem } from "@froggy/domain";
import type { WatchlistPreview } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui/components/collapsible";
import { Field, FieldGroup, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Textarea } from "@froggy/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowRightIcon, CheckIcon, LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { formatCredits } from "../../lib/credit-view";
import { networkWords } from "../../lib/mandate-words";
import { useWatchlist } from "../../lib/watchlist-client";
import { ItemImage } from "./item-image";
import { MonitorSetup } from "./monitoring-panel";

const PreviewFacts = ({
  preview,
  title,
}: {
  readonly preview: WatchlistPreview | undefined;
  readonly title: string;
}): ReactElement => (
  <>
    {(preview?.imageUrl ?? "") !== "" && preview?.ref !== undefined ? (
      <ItemImage id={preview.ref} title={title} />
    ) : null}
    {preview?.observation ? (
      <div
        className="bg-muted rounded-xl p-3 text-sm"
        aria-label="Preview details"
      >
        {preview.observation.price === null ? null : (
          <p className="font-semibold tabular-nums">
            {preview.observation.currency}{" "}
            {preview.observation.price.toLocaleString()}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          From page metadata ·{" "}
          {preview.observation.basis ||
            "Check the selected option before comparing prices."}
        </p>
      </div>
    ) : null}
  </>
);

const PreviewForm = ({
  candidate,
  preview,
  onSaved,
}: {
  readonly candidate: WatchlistInput;
  readonly preview: WatchlistPreview | undefined;
  readonly onSaved: (item: WatchlistItem) => void;
}): ReactElement => {
  const { capture } = useWatchlist();
  const [kind, setKind] = useState(candidate.source._tag);
  const { catalog } = useServiceApi();
  const card = catalog.data?.services.find(
    (entry) => entry.name === "token_snapshot"
  );
  let price: number | null = 1_000_000;
  if (kind === "wallet") {
    price = 0;
  }
  if (kind === "token") {
    price =
      card?.status === "unavailable" ? null : (card?.priceUsdMicros ?? null);
  }
  const address =
    candidate.source._tag === "token" || candidate.source._tag === "wallet";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const decoded = Schema.decodeUnknownResult(WatchlistInput)({
          title: data.get("title"),
          notes: data.get("notes"),
          source: { ...candidate.source, _tag: data.get("kind") },
        });
        if (decoded._tag === "Success") {
          const { submitter } = event.nativeEvent;
          const enrich =
            submitter instanceof HTMLButtonElement &&
            submitter.value === "enrich" &&
            price !== null;
          capture.mutate(
            {
              ...decoded.success,
              v: 2,
              enrich,
              acceptedPrice: price ?? 0,
              previewRef: preview?.ref,
            },
            {
              onSuccess: (result) => {
                onSaved(result.item);
              },
            }
          );
        }
      }}
    >
      <PreviewFacts preview={preview} title={candidate.title} />
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field>
            <FieldLabel htmlFor="preview-title">Name</FieldLabel>
            <Input
              id="preview-title"
              name="title"
              defaultValue={candidate.title}
              maxLength={120}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="preview-kind">Save as</FieldLabel>
            <NativeSelect
              id="preview-kind"
              name="kind"
              value={kind}
              onChange={(event) => {
                setKind(
                  Schema.decodeUnknownSync(
                    Schema.Literals([
                      "token",
                      "wallet",
                      "link",
                      "product",
                      "flight",
                    ])
                  )(event.target.value)
                );
              }}
            >
              {address ? (
                <>
                  <NativeSelectOption value="token">Token</NativeSelectOption>
                  <NativeSelectOption value="wallet">
                    Wallet / address
                  </NativeSelectOption>
                </>
              ) : (
                <>
                  <NativeSelectOption value="link">Link</NativeSelectOption>
                  <NativeSelectOption value="product">
                    Shopping
                  </NativeSelectOption>
                  <NativeSelectOption value="flight">Travel</NativeSelectOption>
                </>
              )}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="preview-notes">
            Details <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id="preview-notes"
            name="notes"
            defaultValue={candidate.notes}
            maxLength={1000}
            placeholder="Size, dates, your thesis, or why this caught your eye…"
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className="min-h-11"
          variant={(price ?? 0) > 0 ? "outline" : "default"}
          type="submit"
          value="save"
          disabled={capture.isPending}
        >
          Save item
        </Button>
        {price === null || price === 0 ? null : (
          <Button
            className="min-h-11"
            type="submit"
            value="enrich"
            disabled={capture.isPending}
          >
            {capture.isPending
              ? "Saving…"
              : `Save & enrich · ${formatCredits(price)}`}
          </Button>
        )}
        <span className="text-muted-foreground text-xs">
          {(price ?? 0) > 0
            ? "One check after saving. No automatic renewal."
            : "Free to save · Alerts are optional"}
        </span>
      </div>
      {capture.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {capture.error.message}
        </p>
      ) : null}
    </form>
  );
};

export const SavedItemActions = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => (
  <Collapsible className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <output className="saved-feedback text-brand flex min-h-11 items-center gap-2 text-sm font-medium">
        <CheckIcon className="size-4" aria-hidden />
        Saved
      </output>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link to="/watchlist/$itemId" params={{ itemId: item.id }} />}
      >
        Open item
      </Button>
      {item.source._tag === "email" || item.source._tag === "wallet" ? null : (
        <CollapsibleTrigger render={<Button variant="ghost" />}>
          Add alert
        </CollapsibleTrigger>
      )}
    </div>
    <CollapsibleContent className="watchlist-alert-panel">
      {item.source._tag !== "wallet" && item.source._tag !== "email" ? (
        <MonitorSetup
          item={item}
          onDone={() => {
            // Keep the saved confirmation visible after adding an alert.
          }}
        />
      ) : null}
    </CollapsibleContent>
  </Collapsible>
);

export const PasteItem = (): ReactElement => {
  const { resolve } = useWatchlist();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<
    readonly {
      readonly label: string;
      readonly preview?: WatchlistPreview;
      readonly error?: string;
    }[]
  >([]);
  const [candidate, setCandidate] = useState<WatchlistInput | null>(null);
  const [saved, setSaved] = useState<WatchlistItem | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const preview = (value: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setCandidate(null);
    setSaved(null);
    const networks = Schema.is(EvmAddress)(value)
      ? (["eip155:8453", "eip155:4663"] as const)
      : [undefined];
    setRows(
      networks.map((network) => ({
        label: network === undefined ? "Website" : networkWords(network),
      }))
    );
    void Promise.all(
      networks.map(async (network, index) => {
        try {
          const result = await resolve(
            { v: 1, input: value, network },
            controller.signal
          );
          if (controller.signal.aborted) {
            return;
          }
          setRows((previous) =>
            previous.map((row, position) =>
              position === index ? { ...row, preview: result } : row
            )
          );
          if (networks.length === 1 && result.candidates[0]) {
            setCandidate(result.candidates[0]);
          }
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          setRows((previous) =>
            previous.map((row, position) =>
              position === index
                ? {
                    ...row,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Preview unavailable.",
                  }
                : row
            )
          );
        }
      })
    );
  };
  return (
    <section
      aria-label="Save an address or link"
      className="bg-card flex flex-col gap-4 rounded-2xl border p-4 sm:p-5"
    >
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          preview(input.trim());
        }}
      >
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="watchlist-paste">
            <LinkIcon aria-hidden className="size-4" />
            Something caught your eye?
          </FieldLabel>
          <Input
            id="watchlist-paste"
            autoComplete="off"
            placeholder="Paste an address or link…"
            maxLength={2048}
            value={input}
            onChange={(event) => {
              pending.current?.abort();
              setRows([]);
              setCandidate(null);
              setSaved(null);
              setInput(event.target.value);
            }}
            onPaste={(event) => {
              const value = event.clipboardData.getData("text").trim();
              if (Schema.is(EvmAddress)(value) || /^https?:\/\//u.test(value)) {
                event.preventDefault();
                setInput(value);
                preview(value);
              }
            }}
          />
        </Field>
        <Button
          aria-label="Preview address or link"
          type="submit"
          className="min-h-11"
          disabled={!input.trim()}
        >
          <ArrowRightIcon aria-hidden />
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Tokens and wallets on Base or Robinhood. Products, trips and links
          from anywhere.
        </p>
      ) : (
        <div className="flex flex-col gap-3" aria-live="polite">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                {row.label} ·{" "}
                {row.error ?? row.preview?.notice ?? "Looking up…"}
              </p>
              {rows.length > 1
                ? row.preview?.candidates.map((entry) => (
                    <Button
                      key={entry.source._tag}
                      variant="outline"
                      className="min-h-11 justify-start"
                      onClick={() => {
                        setCandidate(entry);
                        setSaved(null);
                      }}
                    >
                      {entry.title} ·{" "}
                      {entry.source._tag === "token" ? "Token" : "Address"}
                    </Button>
                  ))
                : null}
              {row.preview?.lookup?.networks
                .filter((network) => network.status === "unavailable")
                .map((network) => (
                  <p
                    key={network.network}
                    className="text-muted-foreground text-xs"
                  >
                    This chain could not be checked. Try again or use Add item.
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
      {saved ? <SavedItemActions item={saved} /> : null}
      {!saved && candidate ? (
        <PreviewForm
          key={JSON.stringify(candidate.source)}
          candidate={candidate}
          preview={
            rows.find(
              (row) =>
                row.preview?.candidates.some((entry) => entry === candidate) ===
                true
            )?.preview
          }
          onSaved={setSaved}
        />
      ) : null}
    </section>
  );
};
