import { listChainNames, supportedPresence } from "@froggy/domain";
import type {
  WatchlistData,
  WatchlistItem,
  WalletMonitorStatus,
} from "@froggy/domain";
import { OnchainMonitorConfigure } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Field, FieldLabel } from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Switch } from "@froggy/ui/components/switch";
import { Schema } from "effect";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import { useWalletMonitor } from "../../lib/wallet-monitor-client";
import { activeState } from "../../lib/watch-words";

const notifyCaveat = (
  item: WatchlistItem,
  networks: readonly string[],
  finding: boolean,
  supported: boolean,
  status: WalletMonitorStatus | undefined,
  ethereum: boolean
): string => {
  let caveat =
    item.source._tag === "token"
      ? `24-hour watch on ${listChainNames(networks)}. You choose a price. Free.`
      : `24-hour watch on ${listChainNames(networks)}. Transfers and swaps, to Telegram when connected. Free.`;
  if (finding) {
    caveat = "Finding where it lives first.";
  } else if (!supported) {
    caveat = ethereum
      ? "Not on Ethereum yet. Alerts work on Base and Robinhood."
      : "No supported chain was found. Alerts work on Base and Robinhood.";
  } else if (activeState(status?.state ?? "saved") && status?.monitor) {
    caveat = `Watching until ${new Date(status.monitor.expiresAt).toLocaleString()}. Turn off to pause.`;
  }
  return caveat;
};

const discoveryPending = (data: WatchlistData | undefined): boolean =>
  data === undefined ||
  ["queued", "running"].includes(data.discovery?.status ?? "");
const notifyFailure = (
  note: string | null,
  client: ReturnType<typeof useWalletMonitor>
): string | null =>
  note ??
  client.configure.error?.message ??
  client.change.error?.message ??
  null;
export const NotifyToggle = ({
  item,
  data,
}: {
  readonly item: WatchlistItem;
  readonly data?: WatchlistData | undefined;
}): ReactElement | null => {
  const id = useId();
  const address = item.source._tag === "wallet" || item.source._tag === "token";
  const networks = supportedPresence(data?.presence ?? []);
  const finding = discoveryPending(data);
  const supported = address && networks.length > 0 && !finding;
  const client = useWalletMonitor(item.id, supported);
  const [prompt, setPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = client.view.data?.status;
  const active = activeState(status?.state ?? "saved");
  const pending = client.configure.isPending || client.change.isPending;
  if (!address) {
    return null;
  }
  const caveat = notifyCaveat(
    item,
    networks,
    finding,
    supported,
    status,
    data?.presence?.some(
      (row) => row.network === "eip155:1" && row.status === "observed"
    ) === true
  );
  const failure = notifyFailure(error, client);
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Field orientation="horizontal" className="min-h-11">
        <FieldLabel htmlFor={id}>Notify me</FieldLabel>
        <Switch
          id={id}
          className="press-feedback"
          aria-describedby={`${id}-caveat`}
          aria-disabled={!supported || pending}
          checked={active || prompt}
          onCheckedChange={(checked) => {
            if (!supported || pending) {
              return;
            }
            setError(null);
            if (!checked) {
              setPrompt(false);
              if (active) {
                client.change.mutate("pause");
              }
              return;
            }
            if (item.source._tag === "token") {
              setPrompt(true);
              return;
            }
            client.configure.mutate({
              v: 1,
              telegram: status?.telegramPaired ?? false,
              conditions: [
                { _tag: "transfer", direction: "both", token: null },
                { _tag: "swap", side: "both", token: null },
              ],
            });
          }}
        />
      </Field>
      <p id={`${id}-caveat`} className="text-muted-foreground text-xs">
        {caveat}
      </p>
      {prompt && !active ? (
        <form
          className="watchlist-alert-panel flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const decoded = Schema.decodeUnknownResult(OnchainMonitorConfigure)(
              {
                v: 1,
                telegram: status?.telegramPaired ?? false,
                conditions: [
                  {
                    _tag: "price",
                    comparison: fields.get("comparison"),
                    threshold: fields.get("threshold"),
                    quoteCurrency: "USD",
                  },
                ],
              }
            );
            if (decoded._tag === "Failure") {
              setError("Choose a price greater than zero.");
              return;
            }
            client.configure.mutate(decoded.success, {
              onSuccess: () => {
                setPrompt(false);
              },
              onError: () => {
                setPrompt(false);
              },
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor={`${id}-comparison`}>
              Tell me when the price goes
            </FieldLabel>
            <NativeSelect id={`${id}-comparison`} name="comparison">
              <NativeSelectOption value="below">Below</NativeSelectOption>
              <NativeSelectOption value="above">Above</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-threshold`}>Price in USD</FieldLabel>
            <Input
              id={`${id}-threshold`}
              name="threshold"
              inputMode="decimal"
              required
              maxLength={40}
            />
          </Field>
          <Button
            type="submit"
            className="min-h-11 self-start"
            disabled={pending}
          >
            Start
          </Button>
        </form>
      ) : null}
      {failure === null ? null : (
        <p role="alert" className="text-destructive text-xs">
          {failure}
        </p>
      )}
    </div>
  );
};
