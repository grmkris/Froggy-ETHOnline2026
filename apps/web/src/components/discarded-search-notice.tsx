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
import { useState } from "react";
import type { ReactElement } from "react";

interface DiscardedSearchNoticeProps {
  readonly discarded: boolean;
  readonly onDismiss: () => void;
  readonly what: string;
}

export const DiscardedSearchNotice = ({
  discarded,
  onDismiss,
  what,
}: DiscardedSearchNoticeProps): ReactElement | null => {
  const [hidden, setHidden] = useState(false);
  if (!discarded || hidden) {
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
          onClick={() => {
            setHidden(true);
            onDismiss();
          }}
          size="xs"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
      </AlertAction>
    </Alert>
  );
};
