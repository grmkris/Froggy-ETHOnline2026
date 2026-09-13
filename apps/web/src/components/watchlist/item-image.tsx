import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

export const ItemImage = ({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}): ReactElement | null => {
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
        return;
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id, getToken]);
  return source ? (
    <img
      alt={title}
      className="max-h-48 w-full rounded-xl object-contain"
      src={source}
    />
  ) : null;
};
