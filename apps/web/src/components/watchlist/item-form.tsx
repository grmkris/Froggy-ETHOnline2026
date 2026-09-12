import { WatchlistInput } from "@froggy/domain";
import type { WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@froggy/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@froggy/ui/components/native-select";
import { Textarea } from "@froggy/ui/components/textarea";
import { Schema } from "effect";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useServiceApi } from "../../hooks/use-service-api";
import { networkWords } from "../../lib/mandate-words";
import { useWatchlist } from "../../lib/watchlist-client";

const ItemForm = ({
  item,
  onSaved,
}: {
  readonly item?: WatchlistItem | undefined;
  readonly onSaved: () => void;
}): ReactElement => {
  const { save, patch } = useWatchlist();
  const { catalog } = useServiceApi();
  const [kind, setKind] = useState(item?.source._tag ?? "link");
  const [failure, setFailure] = useState<string | null>(null);
  const networks =
    catalog.data?.services
      .find((card) => card.name === "token_inspect")
      ?.networks?.filter((network) => network.startsWith("eip155:")) ?? [];
  const pending = save.isPending || patch.isPending;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const read = (field: string): string =>
          Schema.decodeUnknownSync(Schema.String)(data.get(field) ?? "").trim();
        const decoded = Schema.decodeUnknownResult(WatchlistInput)({
          title: read("title"),
          notes: read("notes"),
          source:
            item?.source ??
            (kind === "token"
              ? {
                  _tag: kind,
                  network: data.get("network"),
                  address: read("source"),
                }
              : { _tag: kind, url: read("source") }),
        });
        if (decoded._tag === "Failure") {
          setFailure(
            "Add a title and a valid public URL, or an EVM token address and its chain."
          );
          return;
        }
        setFailure(null);
        const callbacks = {
          onSuccess: onSaved,
          onError: (error: Error) => {
            setFailure(error.message);
          },
        };
        if (item === undefined) {
          save.mutate(decoded.success, callbacks);
        } else {
          patch.mutate(
            {
              v: 1,
              id: item.id,
              revision: item.revision,
              title: decoded.success.title,
              notes: decoded.success.notes,
            },
            callbacks
          );
        }
      }}
    >
      <FieldGroup>
        {item === undefined ? (
          <>
            <Field>
              <FieldLabel htmlFor="saved-kind">What are you saving?</FieldLabel>
              <NativeSelect
                id="saved-kind"
                value={kind}
                onChange={(event) => {
                  setKind(
                    Schema.decodeUnknownSync(
                      Schema.Literals(["link", "token", "product", "flight"])
                    )(event.target.value)
                  );
                }}
              >
                <NativeSelectOption value="link">
                  Website or link
                </NativeSelectOption>
                <NativeSelectOption value="token">Token</NativeSelectOption>
                <NativeSelectOption value="product">Product</NativeSelectOption>
                <NativeSelectOption value="flight">Flight</NativeSelectOption>
              </NativeSelect>
            </Field>
            {kind === "token" ? (
              <Field>
                <FieldLabel htmlFor="saved-network">Chain</FieldLabel>
                <NativeSelect id="saved-network" name="network" required>
                  <NativeSelectOption value="">
                    Choose a chain
                  </NativeSelectOption>
                  {networks.map((network) => (
                    <NativeSelectOption key={network} value={network}>
                      {networkWords(network)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {catalog.isError ? (
                  <FieldDescription>
                    Chains could not be loaded. Close and retry.
                  </FieldDescription>
                ) : null}
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="saved-source">
                {kind === "token" ? "Token address" : "Website URL"}
              </FieldLabel>
              <Input
                autoComplete="off"
                id="saved-source"
                maxLength={2048}
                name="source"
                placeholder={kind === "token" ? "0x…" : "https://…"}
                required
                type={kind === "token" ? "text" : "url"}
              />
            </Field>
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor="saved-title">Name</FieldLabel>
          <Input
            defaultValue={item?.title}
            id="saved-title"
            maxLength={120}
            name="title"
            placeholder="Something worth coming back to"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="saved-notes">
            Details <span className="text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            defaultValue={item?.notes}
            id="saved-notes"
            maxLength={1000}
            name="notes"
            placeholder={
              {
                flight: "Dates, route, passengers, baggage…",
                token: "Your thesis, what to research, why you saved it…",
                product: "Size, colour, what you’re looking for…",
                link: "Why you saved it, what to check…",
              }[kind]
            }
          />
          <FieldDescription>
            Saved for later. Automatic price checks do not start when you save.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {failure === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {failure}
        </p>
      )}
      <Button disabled={pending} type="submit">
        {pending ? "Saving…" : "Save item"}
      </Button>
    </form>
  );
};

export const SaveItem = ({
  item,
}: {
  readonly item?: WatchlistItem;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const [formItem, setFormItem] = useState(item);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFormItem(item);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={<Button variant={item === undefined ? "default" : "outline"} />}
      >
        {item === undefined ? (
          <>
            <PlusIcon data-icon="inline-start" />
            Add item
          </>
        ) : (
          "Edit details"
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item === undefined
              ? "Keep an eye on something"
              : "Edit saved item"}
          </DialogTitle>
          <DialogDescription>
            Tokens, trips, things you want. All in one place.
          </DialogDescription>
        </DialogHeader>
        <ItemForm
          item={formItem}
          onSaved={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
