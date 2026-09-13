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

import { useWatchlist } from "../../lib/watchlist-client";
import { SavedItemActions } from "./saved-item-actions";

const ItemForm = ({
  item,
  onSaved,
}: {
  readonly item?: WatchlistItem | undefined;
  readonly onSaved: (saved: WatchlistItem) => void;
}): ReactElement => {
  const { save, patch } = useWatchlist();
  const [kind, setKind] = useState(item?.source._tag ?? "link");
  const [failure, setFailure] = useState<string | null>(null);
  const sourceLabel = {
    email: "Email",
    token: "Token address",
    wallet: "Wallet address",
    link: "Website URL",
    product: "Website URL",
    flight: "Website URL",
  }[kind];
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
          source: item?.source ?? { _tag: kind, url: read("source") },
        });
        if (decoded._tag === "Failure") {
          setFailure(
            "Add a title and a valid public URL. Addresses go in the track bar."
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
                      Schema.Literals(["link", "product", "flight"])
                    )(event.target.value)
                  );
                }}
              >
                <NativeSelectOption value="link">
                  Website or link
                </NativeSelectOption>
                <NativeSelectOption value="product">Product</NativeSelectOption>
                <NativeSelectOption value="flight">Flight</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="saved-source">{sourceLabel}</FieldLabel>
              <Input
                autoComplete="off"
                id="saved-source"
                maxLength={2048}
                name="source"
                placeholder="https://…"
                required
                type="url"
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
                email: "Useful trip or product details…",
                flight: "Dates, route, passengers, baggage…",
                token: "Your thesis, what to research, why you saved it…",
                wallet: "Whose wallet this is, what you want to follow…",
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
  open: controlledOpen,
  onOpenChange,
}: {
  readonly item?: WatchlistItem;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}): ReactElement => {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [saved, setSaved] = useState<WatchlistItem | null>(null);
  const [formItem, setFormItem] = useState(item);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFormItem(item);
          setSaved(null);
        }
        setOpen(next);
      }}
    >
      {controlledOpen === undefined ? (
        <DialogTrigger
          render={
            <Button variant={item === undefined ? "default" : "outline"} />
          }
        >
          {item === undefined ? (
            <>
              <PlusIcon data-icon="inline-start" />
              Add something by hand
            </>
          ) : (
            "Edit details"
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item === undefined ? "Add something by hand" : "Edit saved item"}
          </DialogTitle>
          <DialogDescription>
            A link, a product page or a trip. Addresses go in the bar.
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <SavedItemActions item={saved} />
        ) : (
          <ItemForm
            item={formItem}
            onSaved={(next) => {
              if (item) {
                setOpen(false);
              } else {
                setSaved(next);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
