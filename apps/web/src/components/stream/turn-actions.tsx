/**
 * What you can do with a finished answer: keep its words, or ask again.
 *
 * Copy takes the text parts only — never a tool's raw output, which has its
 * own place. Try again exists only for a turn that ended in an error and
 * spent nothing: a turn with a settled receipt is a fact, and asking the
 * model to redo it would be asking it to pay twice.
 */

import { Button } from "@froggy/ui/components/button";
import { CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

/** How long "Copied" stays before the button reads Copy again. */
const COPIED_MS = 1500;

const CopyButton = ({ text }: { readonly text: string }): ReactElement => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = copied
      ? setTimeout(() => {
          setCopied(false);
        }, COPIED_MS)
      : null;
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [copied]);
  return (
    <Button
      aria-label={copied ? "Copied" : "Copy the answer"}
      onClick={() => {
        void (async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        })();
      }}
      size="xs"
      type="button"
      variant="ghost"
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
};

export const TurnActions = ({
  onRetry,
  text,
}: {
  /** Null when this turn cannot be asked again. */
  readonly onRetry: (() => void) | null;
  readonly text: string;
}): ReactElement | null =>
  text.trim() === "" && onRetry === null ? null : (
    <div className="text-muted-foreground -ml-2 flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
      {text.trim() === "" ? null : <CopyButton text={text} />}
      {onRetry === null ? null : (
        <Button onClick={onRetry} size="xs" type="button" variant="ghost">
          <RotateCcwIcon data-icon="inline-start" />
          Try again
        </Button>
      )}
    </div>
  );
