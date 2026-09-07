/**
 * Something that happened to the wallet or the turn, between the turns.
 *
 * A pause for the person is a line across the
 * conversation, because everything after it is different; a top-up, an
 * answer or a turn started elsewhere is a note in the margin. None has a
 * live role: the announcer says them once, and a marker that announced
 * itself would say them twice.
 */

import { Button } from "@froggy/ui/components/button";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@froggy/ui/components/marker";
import { cn } from "@froggy/ui/lib/utils";
import {
  BellIcon,
  CheckIcon,
  HandIcon,
  PiggyBankIcon,
  SmartphoneIcon,
} from "lucide-react";
import type { SunIcon } from "lucide-react";
import type { ReactElement } from "react";

import type { TimelineEvent } from "../../lib/app-state";
import { clockTime } from "../../lib/format";

const ICON: Record<TimelineEvent["kind"], typeof SunIcon> = {
  answered: CheckIcon,
  asked: HandIcon,
  elsewhere: SmartphoneIcon,
  notice: BellIcon,
  topup: PiggyBankIcon,
};

const TONE: Record<TimelineEvent["kind"], string> = {
  answered: "text-brand",
  asked: "text-drive-agent-foreground",
  elsewhere: "text-drive-human",
  notice: "text-drive-agent-foreground",
  topup: "text-brand",
};

/** A line across the conversation, or a note in its margin. */
const ACROSS: ReadonlySet<TimelineEvent["kind"]> = new Set(["asked"]);

export const MarkerRow = ({
  event,
}: {
  readonly event: TimelineEvent;
}): ReactElement => {
  const IconOf = ICON[event.kind];
  return (
    <Marker
      className={cn("px-1", TONE[event.kind])}
      data-event={event.kind}
      variant={ACROSS.has(event.kind) ? "separator" : "default"}
    >
      <MarkerIcon>
        <IconOf />
      </MarkerIcon>
      <MarkerContent>
        {event.text}
        <span className="text-machine ml-2 opacity-60">
          {clockTime(event.at)}
        </span>
      </MarkerContent>
      {event.kind === "elsewhere" ? (
        <Button
          className="ml-auto shrink-0"
          onClick={() => {
            globalThis.location.reload();
          }}
          size="xs"
          variant="secondary"
        >
          Reload
        </Button>
      ) : null}
    </Marker>
  );
};
