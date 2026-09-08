/**
 * A run of page steps as one card.
 *
 * "Browsed the oracle · 4 steps" is the story; each step is a row inside
 * it, with its raw output one click further. While the agent is still on
 * the page the card is open, amber, and says what it is doing now; when the
 * run is done it settles and folds. A person's toggle outranks the automatic
 * one, as everywhere.
 */

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui/components/collapsible";
import { DrivingDot } from "@froggy/ui/components/driving-ring";
import { cn } from "@froggy/ui/lib/utils";
import { ChevronDownIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { hostOf } from "../../lib/format";
import type { ToolCall } from "../../lib/tool-call";
import { toolStatus } from "../../lib/tool-status";
import { storyLine, storyOf } from "../../lib/tool-stories";
import { summarize } from "../../lib/tool-summary";
import { MotionItem } from "../motion-item";

/** The host of the last page opened, or the page in general. */
const hostOfRun = (calls: readonly ToolCall[]): string => {
  const opened = calls
    .toReversed()
    .find((call) => call.name === "browser_navigate");
  const host = opened === undefined ? "" : hostOf(opened.input.url ?? "");
  return host === "" ? "the page" : host;
};

const Step = ({ call }: { readonly call: ToolCall }): ReactElement => {
  const story = storyOf(call.name);
  const status = toolStatus(call, summarize(call), { asking: false });
  const IconOf = story.icon;
  return (
    <Collapsible className="rounded-lg">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs select-none [&[data-panel-open]_[data-slot=chevron]]:rotate-180">
        <IconOf aria-hidden className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">
          {storyLine(story, call.input, status.live)}
        </span>
        <span className="text-machine shrink-0 opacity-60">{status.label}</span>
        <ChevronDownIcon
          aria-hidden
          className="size-3 shrink-0 opacity-50"
          data-slot="chevron"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 px-2 pb-2">
        <pre className="text-machine max-h-24 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(call.input, null, 2)}
        </pre>
        {call.output === null ? null : (
          <pre className="text-machine bg-paper-deep/70 max-h-48 overflow-auto rounded-lg p-2 whitespace-pre-wrap">
            {call.output.slice(0, 4000)}
          </pre>
        )}
        {call.errorText === null ? null : (
          <p className="text-destructive text-xs">{call.errorText}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

/** What the run is doing now, or what it did. */
const headingOf = (
  calls: readonly ToolCall[],
  live: boolean,
  host: string
): string => {
  if (!live) {
    return `Browsed ${host}`;
  }
  const current = calls.at(-1);
  return current === undefined
    ? `Browsing ${host}`
    : storyLine(storyOf(current.name), current.input, true);
};

const statusWord = (live: boolean, failed: boolean): string => {
  if (live) {
    return "running…";
  }
  return failed ? "failed" : "done";
};

export const BrowseCard = ({
  calls,
}: {
  readonly calls: readonly ToolCall[];
}): ReactElement => {
  const [touched, setTouched] = useState<boolean | null>(null);
  const statuses = calls.map((call) =>
    toolStatus(call, summarize(call), { asking: false })
  );
  const live = statuses.some((status) => status.live);
  const failed = statuses.some((status) => status.phase === "failed");
  const host = hostOfRun(calls);
  const heading = headingOf(calls, live, host);
  return (
    <Collapsible
      className={cn(
        "browse-progress shadow-card relative isolate overflow-hidden rounded-xl text-sm ring-1 transition-colors",
        "ring-drive-agent/30 bg-drive-agent-soft/50",
        live && "ring-drive-agent/60 bg-drive-agent-soft/70",
        failed && "ring-destructive/40"
      )}
      data-tool="browse"
      data-live={live}
      onFocusCapture={() => {
        setTouched((previous) => previous ?? live);
      }}
      onOpenChange={(next) => {
        setTouched(next);
      }}
      open={touched ?? live}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left select-none [&[data-panel-open]_[data-slot=chevron]]:rotate-180">
        {live ? (
          <DrivingDot className="shrink-0" mode="agent" />
        ) : (
          <GlobeIcon aria-hidden className="size-4 shrink-0 opacity-70" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {heading}
          <span className="text-muted-foreground">
            {" "}
            · {calls.length} step{calls.length === 1 ? "" : "s"}
          </span>
        </span>
        <MotionItem
          inline
          className="text-machine w-16 shrink-0 text-right opacity-60"
          key={statusWord(live, failed)}
        >
          {statusWord(live, failed)}
        </MotionItem>
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 shrink-0 opacity-50"
          data-slot="chevron"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-1 py-1">
        {calls.map((call) => (
          <Step call={call} key={call.toolCallId} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};
