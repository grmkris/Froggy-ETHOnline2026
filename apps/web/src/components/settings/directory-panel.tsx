/**
 * The directory: paste a 402, see what it costs, decide.
 *
 * A probe pays nothing. Adding is the one click that makes a stranger's
 * endpoint payable — its host and payee go onto the mandate — and it is a
 * person's click, never the agent's. What the agent can do is ask what
 * something costs; this is where the answer becomes permission.
 */

import { DirectoryEntry } from "@froggy/domain";
import type { Receipt } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

const Option = Schema.Struct({
  amount: Schema.String,
  asset: Schema.String,
  network: Schema.String,
  payTo: Schema.String,
  reason: Schema.NullOr(Schema.String),
  scheme: Schema.String,
  supported: Schema.Boolean,
});

const Probe = Schema.Union([
  Schema.Struct({
    host: Schema.String,
    kind: Schema.Literals(["free"]),
    status: Schema.Int,
    url: Schema.String,
  }),
  Schema.Struct({
    host: Schema.String,
    kind: Schema.Literals(["paid"]),
    options: Schema.Array(Option),
    supported: Schema.Boolean,
    url: Schema.String,
  }),
  Schema.Struct({
    host: Schema.String,
    kind: Schema.Literals(["unreachable"]),
    reason: Schema.String,
    url: Schema.String,
  }),
]);
type Probe = typeof Probe.Type;

const Entries = Schema.Struct({ entries: Schema.Array(DirectoryEntry) });
const decodeProbe = Schema.decodeUnknownSync(Probe);
const decodeEntries = Schema.decodeUnknownSync(Entries);

/** Tinybars to HBAR; anything else stays in its own units. */
const priceLabel = (amount: string, asset: string, network: string): string =>
  network === "hedera:testnet" && asset === "0.0.0"
    ? `${(Number(amount) / 1e8).toFixed(4)} tHBAR`
    : `${amount} ${asset}`;

const ProbeCard = ({
  onAdd,
  probe,
}: {
  readonly onAdd: () => void;
  readonly probe: Probe;
}): ReactElement => {
  if (probe.kind === "free") {
    return (
      <p className="rounded-xl border p-3 text-sm">
        {probe.host} answered {probe.status}, not 402. It is not asking to be
        paid.
      </p>
    );
  }
  if (probe.kind === "unreachable") {
    return (
      <p className="bg-refused-soft rounded-xl p-3 text-sm">
        Could not probe {probe.host}: {probe.reason}.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">{probe.host} asks to be paid.</p>
      <ul className="space-y-1">
        {probe.options.map((option) => (
          <li
            className="flex items-baseline gap-2"
            key={`${option.network}:${option.payTo}:${option.amount}`}
          >
            <span className="text-money">
              {priceLabel(option.amount, option.asset, option.network)}
            </span>
            <span className="text-machine text-muted-foreground flex-1 truncate">
              {option.network} → {option.payTo}
            </span>
            <span
              className={
                option.supported
                  ? "text-brand text-xs"
                  : "text-destructive text-xs"
              }
            >
              {option.supported ? "payable" : (option.reason ?? "not payable")}
            </span>
          </li>
        ))}
      </ul>
      {probe.supported ? (
        <Button onClick={onAdd} size="sm">
          Add to the directory
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">
          Nothing here can be paid from this wallet. A seller on Hedera testnet
          needs the exact scheme and a fee payer in the challenge.
        </p>
      )}
    </div>
  );
};

const EntryRow = ({
  entry,
  onRemove,
  paid,
}: {
  readonly entry: DirectoryEntry;
  readonly onRemove: () => void;
  readonly paid: number;
}): ReactElement => (
  <li className="flex items-center gap-2 text-sm">
    <span className="min-w-0 flex-1">
      <span className="block truncate">{entry.label}</span>
      <span className="text-machine text-muted-foreground block truncate">
        {priceLabel(entry.amount, entry.asset, entry.network)} · {entry.payTo}
        {paid > 0 ? ` · paid ${paid}×` : ""}
      </span>
    </span>
    <Button
      aria-label={`Remove ${entry.label}`}
      onClick={onRemove}
      size="icon-xs"
      variant="ghost"
    >
      <XIcon />
    </Button>
  </li>
);

export const DirectoryPanel = ({
  receipts,
}: {
  readonly receipts: readonly Receipt[];
}): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const [url, setUrl] = useState("");
  const headers = async (): Promise<Headers> => {
    const token = await getToken();
    const sent = new Headers({ "content-type": "application/json" });
    if (token !== null) {
      sent.set("authorization", `Bearer ${token}`);
    }
    return sent;
  };

  const entries = useQuery({
    queryFn: async () => {
      const response = await fetch("/api/directory", {
        headers: await headers(),
      });
      if (!response.ok) {
        throw new Error(`directory: ${response.status}`);
      }
      return decodeEntries(await response.json()).entries;
    },
    queryKey: ["directory"],
  });

  const probe = useMutation({
    mutationFn: async (target: string) => {
      const response = await fetch("/api/directory/probe", {
        body: JSON.stringify({ url: target }),
        headers: await headers(),
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`probe: ${response.status}`);
      }
      return decodeProbe(await response.json());
    },
  });

  const add = useMutation({
    mutationFn: async (target: string) => {
      const response = await fetch("/api/directory", {
        body: JSON.stringify({ url: target }),
        headers: await headers(),
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`add: ${response.status}`);
      }
    },
    onSuccess: () => {
      probe.reset();
      setUrl("");
      void queries.invalidateQueries({ queryKey: ["directory"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/directory/${id}`, {
        headers: await headers(),
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["directory"] });
    },
  });

  const paidCount = (entry: DirectoryEntry): number =>
    receipts.filter(
      (receipt) =>
        receipt.intent.host === entry.host && receipt.settlement !== undefined
    ).length;

  return (
    <div className="space-y-4">
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim() !== "") {
            probe.mutate(url.trim());
          }
        }}
      >
        <Input
          aria-label="A URL that answers 402"
          className="text-machine h-8"
          onChange={(event) => {
            setUrl(event.target.value);
          }}
          placeholder="https://seller.example/brief"
          value={url}
        />
        <Button
          disabled={probe.isPending || url.trim() === ""}
          size="sm"
          type="submit"
          variant="outline"
        >
          Probe
        </Button>
      </form>
      {probe.isError ? (
        <p className="bg-refused-soft rounded-xl p-3 text-sm">
          The probe could not be sent.
        </p>
      ) : null}
      {probe.data === undefined ? null : (
        <ProbeCard
          onAdd={() => {
            add.mutate(probe.data.url);
          }}
          probe={probe.data}
        />
      )}
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs">
          Endpoints the agent may pay a 402 to. Adding one puts its host and
          payee on the mandate; removing it takes them off.
        </p>
        {entries.data === undefined || entries.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing beyond Froggy&apos;s own paid endpoint yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.data.map((entry) => (
              <EntryRow
                entry={entry}
                key={entry.id}
                onRemove={() => {
                  remove.mutate(entry.id);
                }}
                paid={paidCount(entry)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
