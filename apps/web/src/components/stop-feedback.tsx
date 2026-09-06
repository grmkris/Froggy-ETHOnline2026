import { Button } from "@froggy/ui/components/button";
import { Schema } from "effect";
import { useCallback, useRef, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../lib/session-token";

type StopState = "idle" | "requesting" | "requested" | "absent" | "unconfirmed";
const decodeStop = Schema.decodeUnknownSync(
  Schema.Struct({ stopped: Schema.Boolean })
);
const WORDS: Record<StopState, string> = {
  idle: "",
  requesting: "Requesting stop…",
  requested: "Stop requested. Payments already submitted may still settle.",
  absent: "No active run.",
  unconfirmed: "Stopping is unconfirmed. The agent may still be working.",
};

const requestStop = async (token: string | null): Promise<boolean> => {
  const response = await fetch("/api/chat/stop", {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Stop was not acknowledged");
  }
  return decodeStop(await response.json()).stopped;
};

export const useStopRun = (detach: () => Promise<void>) => {
  const { getToken } = useSessionToken();
  const [state, setState] = useState<StopState>("idle");
  const pending = useRef(false);
  const clear = useCallback(() => {
    setState("idle");
  }, []);
  const stop = useCallback((): void => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setState("requesting");
    void (async () => {
      try {
        const stopped = await requestStop(await getToken());
        setState(stopped ? "requested" : "absent");
        // Detaching locally is safe only after the server acknowledges the request.
        await detach();
      } catch {
        setState("unconfirmed");
      }
      pending.current = false;
    })();
  }, [detach, getToken]);
  const blocked = state === "requesting" || state === "unconfirmed";
  return { blocked, clear, state, stop };
};

export const StopFeedback = ({
  state,
  onRetry,
  onDismiss,
}: {
  readonly state: StopState;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}): ReactElement | null => {
  if (state === "idle") {
    return null;
  }
  if (state === "unconfirmed") {
    return (
      <div
        className="bg-refused-soft flex items-center justify-between gap-3 rounded-xl p-3 text-sm"
        role="alert"
      >
        <span>{WORDS[state]}</span>
        <Button className="min-h-11" onClick={onRetry} variant="outline">
          Retry stopping
        </Button>
      </div>
    );
  }
  return (
    <div className="bg-muted flex items-center justify-between gap-3 rounded-xl p-3 text-sm">
      <output>{WORDS[state]}</output>
      {state === "requesting" ? null : (
        <Button className="min-h-11" onClick={onDismiss} variant="ghost">
          Dismiss
        </Button>
      )}
    </div>
  );
};
