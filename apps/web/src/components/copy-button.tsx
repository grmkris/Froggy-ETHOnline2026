import { Button } from "@froggy/ui/components/button";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

export const CopyButton = ({
  children = "Copy",
  label,
  text,
}: {
  readonly children?: ReactNode;
  readonly label: string;
  readonly text: string;
}): ReactElement => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [animate, setAnimate] = useState(false);
  const errorId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const copy = async (fromPointer: boolean): Promise<void> => {
    setPending(true);
    setFailed(false);
    try {
      await navigator.clipboard.writeText(text);
      if (!mounted.current) {
        return;
      }
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
      setAnimate(fromPointer);
      setCopied(true);
      timer.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      if (mounted.current) {
        setCopied(false);
        setFailed(true);
      }
    }
    if (mounted.current) {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex max-w-full flex-col gap-1">
      <span className="inline-flex items-center gap-2">
        <Button
          aria-describedby={failed ? errorId : undefined}
          aria-label={label}
          className="min-h-11"
          disabled={pending}
          onClick={(event) => {
            void copy(event.detail > 0);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {children}
        </Button>
        <span
          aria-hidden="true"
          className="text-brand w-12 text-xs"
          style={{
            opacity: copied ? 1 : 0,
            transitionDuration:
              animate && copied ? "var(--motion-feedback)" : "0ms",
            transitionProperty: "opacity",
            transitionTimingFunction: "var(--ease-out)",
          }}
        >
          Copied
        </span>
        <output className="sr-only">
          {copied ? "Copied to clipboard." : ""}
        </output>
      </span>
      {failed ? (
        <span
          className="text-refused max-w-64 text-xs"
          id={errorId}
          role="alert"
        >
          Couldn’t copy. Try again, or select and copy the text yourself.
        </span>
      ) : null}
    </span>
  );
};
