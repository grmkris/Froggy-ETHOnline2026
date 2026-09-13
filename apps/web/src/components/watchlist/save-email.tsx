import { WatchlistItem } from "@froggy/domain";
import type { EmailId } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";
import type { ReactElement } from "react";

import { useWatchlist } from "../../lib/watchlist-client";

export const SaveEmail = ({
  emailId,
}: {
  readonly emailId: EmailId;
}): ReactElement => {
  const { request, list } = useWatchlist();
  const [saved, setSaved] = useState<WatchlistItem | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const save = async () => {
    setPending(true);
    setFailure(null);
    try {
      const result = Schema.decodeUnknownSync(
        Schema.Struct({ v: Schema.Literal(1), item: WatchlistItem })
      )(
        await request("/api/watchlist/from-email", {
          method: "POST",
          body: JSON.stringify({ v: 1, emailId }),
        })
      );
      setSaved(result.item);
      await list.refetch();
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Could not save these details."
      );
    }
    setPending(false);
  };
  return (
    <div className="flex flex-col gap-2">
      {saved ? (
        <Link
          className="text-brand min-h-11 py-3 text-sm underline"
          to="/watchlist/$itemId"
          params={{ itemId: saved.id }}
        >
          Saved · Open details
        </Link>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            void save();
          }}
        >
          {pending ? "Saving…" : "Save trip or product details"}
        </Button>
      )}
      {failure === null ? null : (
        <p role="alert" className="text-destructive max-w-sm text-sm">
          {failure}
        </p>
      )}
    </div>
  );
};
