/**
 * What the model thought, folded.
 *
 * Open while the thinking streams, so the person sees it happen; a second
 * after it stops, it folds itself away and the label becomes how long it
 * took. Touch it and it stays where you put it: a person's toggle outranks
 * the automatic one. A reasoning part read back from history was never live
 * here, so it mounts folded with no duration to claim.
 */

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui/components/collapsible";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@froggy/ui/components/marker";
import { cn } from "@froggy/ui/lib/utils";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

/** How long the thought stays open after the last word. */
const FOLD_AFTER_MS = 1000;

interface ReasoningProps {
  readonly live: boolean;
  readonly text: string;
}

const label = (live: boolean, seconds: number | null): string => {
  if (live) {
    return "Thinking…";
  }
  return seconds === null ? "Thought" : `Thought for ${seconds}s`;
};

export const Reasoning = ({ live, text }: ReasoningProps): ReactElement => {
  const [auto, setAuto] = useState(live);
  const [touched, setTouched] = useState<boolean | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (live && startedAt.current === null) {
      startedAt.current = Date.now();
    }
    const started = startedAt.current;
    // The fold and the duration land together, from the timer, a second on.
    const timer = live
      ? null
      : setTimeout(() => {
          setAuto(false);
          if (started !== null) {
            setSeconds(Math.max(1, Math.round((Date.now() - started) / 1000)));
          }
        }, FOLD_AFTER_MS);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [live]);

  return (
    <Collapsible
      onOpenChange={(next) => {
        setTouched(next);
      }}
      open={touched ?? auto}
    >
      <Marker
        className="cursor-pointer select-none [&[data-panel-open]_[data-slot=chevron]]:rotate-180"
        render={<CollapsibleTrigger />}
      >
        <MarkerIcon>
          <BrainIcon />
        </MarkerIcon>
        <MarkerContent className={cn(live && "shimmer")}>
          {label(live, seconds)}
        </MarkerContent>
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 shrink-0 opacity-50"
          data-slot="chevron"
        />
      </Marker>
      <CollapsibleContent className="text-muted-foreground mt-1 pl-6 text-xs leading-relaxed whitespace-pre-wrap">
        {text}
      </CollapsibleContent>
    </Collapsible>
  );
};
