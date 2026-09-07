/** The image a task made, fetched with the person's token, never by a bare URL. */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

export const ServiceImagePreview = ({
  description,
  url,
}: {
  readonly description: string;
  readonly url: string;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(url, {
          headers: { authorization: `Bearer ${token ?? ""}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl !== null) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, getToken]);
  if (failed) {
    return (
      <p className="text-muted-foreground text-sm">
        Preview unavailable. You can still download the image.
      </p>
    );
  }
  return source === null ? (
    <output className="text-muted-foreground text-sm">
      Loading the image…
    </output>
  ) : (
    <img
      alt={description}
      className="max-h-80 w-full rounded-lg object-contain outline outline-1 outline-black/10"
      src={source}
    />
  );
};
