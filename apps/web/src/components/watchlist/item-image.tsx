import type { WatchlistItemId, WatchlistPreviewId } from "@froggy/domain";
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

export const ItemImage = ({
  id,
  title,
  compact = false,
}: {
  readonly id: WatchlistItemId | WatchlistPreviewId;
  readonly title: string;
  readonly compact?: boolean;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/watchlist/images/${id}`, {
          headers: { authorization: `Bearer ${token ?? ""}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch {
        // The category icon remains when an image is unavailable.
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, getToken]);
  return (
    <div
      className={
        compact
          ? "bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
          : "bg-muted flex h-48 w-full items-center justify-center overflow-hidden rounded-xl"
      }
    >
      {source === null ? (
        <ImageIcon aria-hidden className="text-muted-foreground size-5" />
      ) : (
        <img
          alt={title}
          className="h-full w-full object-contain"
          src={source}
        />
      )}
    </div>
  );
};
