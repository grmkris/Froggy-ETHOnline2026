import { BrowseTaskResponse } from "@froggy/protocol";
import type { BrowseTaskControl, BrowseTaskView } from "@froggy/protocol";
import { Schema } from "effect";
import { useContext, useRef, useState } from "react";

import { useSessionToken } from "../lib/session-token";
import { WorkspaceContext } from "../lib/workspace-context";

export const useBrowseControl = (task: BrowseTaskView) => {
  const app = useContext(WorkspaceContext)?.app;
  const { getToken } = useSessionToken();
  const [pending, setPending] = useState<BrowseTaskControl["action"] | null>(
    null
  );
  const [controlError, setControlError] = useState<string | null>(null);
  const sending = useRef(false);
  const control = async (
    action: BrowseTaskControl["action"]
  ): Promise<void> => {
    if (sending.current) {
      return;
    }
    sending.current = true;
    setPending(action);
    setControlError(null);
    const sessionId = app?.sessionId;
    try {
      const token = await getToken();
      const response = await fetch(`/api/tasks/${task.id}/control`, {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ v: 1, action }),
      });
      if (!response.ok) {
        setControlError(
          "The request could not be confirmed. Check the task status before trying again."
        );
        sending.current = false;
        setPending(null);
        return;
      }
      const value = Schema.decodeUnknownSync(BrowseTaskResponse)(
        await response.json()
      );
      if (sessionId !== null && sessionId !== undefined) {
        app?.dispatch({
          type: "browse.snapshot",
          sessionId,
          tasks: [value.task],
        });
      }
    } catch (error) {
      setControlError(
        error instanceof Error
          ? error.message
          : "The request could not be confirmed."
      );
    }
    sending.current = false;
    setPending(null);
  };
  return { control, pending, error: controlError };
};
