import type { BrowserState } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import "./browse-task.css";
import { useSessionToken } from "../../lib/session-token";

const Viewer = Schema.Struct({
  v: Schema.Literals([1]),
  url: Schema.NullOr(Schema.String),
});
interface ViewerResult {
  readonly url: string | null;
  readonly error: boolean;
}
const loadViewer = async (
  getToken: () => Promise<string | null>,
  signal: AbortSignal
): Promise<ViewerResult> => {
  try {
    const token = await getToken();
    const response = await fetch("/api/browser/viewer", {
      headers: { authorization: `Bearer ${token ?? ""}` },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) {
      return { url: null, error: true };
    }
    const value = Schema.decodeUnknownSync(Viewer)(await response.json());
    if (
      value.url === null ||
      new URL(value.url).origin !== "https://live.browser-use.com"
    ) {
      return { url: null, error: true };
    }
    return { url: value.url, error: false };
  } catch {
    return { url: null, error: true };
  }
};

const ViewerFrame = ({
  url,
  interactive,
  state,
  onRetry,
}: {
  readonly url: string;
  readonly interactive: boolean;
  readonly state: BrowserState;
  readonly onRetry: () => void;
}): ReactElement => {
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 15_000);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const human = interactive && state.cloud?.control === "human";
  return (
    <div className="relative h-full w-full">
      <iframe
        allow="autoplay"
        className="block h-full w-full border-0"
        inert={!human}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        src={url}
        onLoad={() => {
          setFrameLoaded(true);
        }}
        title={
          human
            ? "Your shared browser. You have control."
            : "Your shared browser. Watching the agent."
        }
      />
      {frameLoaded ? null : (
        <div
          className="browse-viewer-overlay bg-background/90 absolute inset-0 flex flex-col items-center justify-center gap-3 p-4"
          aria-live="polite"
        >
          <p className="text-sm">
            {timedOut
              ? "The viewer is taking longer to load. Your task may still be running."
              : "Loading the live viewer…"}
          </p>
          {timedOut ? (
            <Button className="min-h-11" onClick={onRetry} variant="outline">
              Reconnect viewer
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export const CloudViewer = ({
  state,
  interactive,
}: {
  readonly state: BrowserState;
  readonly interactive: boolean;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const [loaded, setLoaded] = useState<
    ViewerResult & { expiresAt: number | null | undefined; retry: number }
  >({ url: null, error: false, expiresAt: undefined, retry: 0 });
  const [retry, setRetry] = useState(0);

  const expiresAt = state.cloud?.expiresAt;
  const enabled =
    state.status === "running" && state.cloud?.viewerReady === true;
  useEffect(() => {
    const controller = new AbortController();
    if (enabled) {
      void (async () => {
        const value = await loadViewer(getToken, controller.signal);
        if (!controller.signal.aborted) {
          setLoaded({ ...value, expiresAt, retry });
        }
      })();
    }
    return () => {
      controller.abort();
    };
  }, [enabled, expiresAt, getToken, retry]);
  const current =
    enabled && loaded.expiresAt === expiresAt && loaded.retry === retry;
  if (current && loaded.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-sm">The live viewer could not connect.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRetry((value) => value + 1);
          }}
        >
          Reconnect viewer
        </Button>
      </div>
    );
  }
  if (!current || loaded.url === null) {
    return (
      <div className="text-muted-foreground grid h-full place-items-center text-sm">
        Connecting to your Cloud browser…
      </div>
    );
  }
  return (
    <ViewerFrame
      key={`${loaded.url}:${retry}`}
      url={loaded.url}
      interactive={interactive}
      state={state}
      onRetry={() => {
        setRetry((value) => value + 1);
      }}
    />
  );
};
