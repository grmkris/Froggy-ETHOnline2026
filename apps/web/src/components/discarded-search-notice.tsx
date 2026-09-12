/**
 * A named URL value the router could not keep. Dismissible, because a stale
 * link Froggy itself handed out should not look like an ordinary empty page.
 */

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Button } from "@froggy/ui/components/button";
import type { ReactElement } from "react";

export const DiscardedSearchNotice = ({
  discarded,
  onDismiss,
  what,
}: {
  readonly discarded: boolean;
  readonly onDismiss: () => void;
  readonly what: string;
}): ReactElement | null => {
  if (!discarded) {
    return null;
  }
  return (
    <Alert>
      <AlertTitle>That link could not be opened</AlertTitle>
      <AlertDescription>
        {what} was not recognised, so this page opened without it.
      </AlertDescription>
      <AlertAction>
        <Button
          aria-label="Dismiss unrecognised link"
          onClick={onDismiss}
          size="xs"
          variant="ghost"
        >
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
};
