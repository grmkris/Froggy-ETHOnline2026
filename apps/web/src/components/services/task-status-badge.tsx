/** A task's state as a word, with a spinner while it still moves. */

import type { TaskStatus } from "@froggy/domain";
import { Badge } from "@froggy/ui/components/badge";
import { Spinner } from "@froggy/ui/components/spinner";
import type { ReactElement } from "react";

import { statusWords } from "../../lib/services-view";
import type { StatusTone } from "../../lib/services-view";

const TONE_CLASS: ReadonlyMap<StatusTone, string> = new Map([
  ["asking", "border-drive-agent/60 text-drive-agent-foreground"],
  ["done", "border-brand/40 text-brand"],
  ["failed", "border-destructive/40 text-destructive"],
  ["settling", "text-muted-foreground"],
  ["uncertain", "border-drive-agent/60 text-drive-agent-foreground"],
]);

export const TaskStatusBadge = ({
  status,
}: {
  readonly status: TaskStatus;
}): ReactElement => {
  const words = statusWords(status);
  return (
    <Badge className={TONE_CLASS.get(words.tone) ?? ""} variant="outline">
      {words.tone === "settling" ? (
        <Spinner className="size-3" label={words.label} />
      ) : null}
      {words.label}
    </Badge>
  );
};
