/**
 * Something that happened to the wallet, between the turns.
 *
 * A freeze is a line across the conversation, because everything after it
 * is different; a top-up is a note in the margin. Neither has a live role:
 * the announcer says them once, and a marker that announced itself would
 * say them twice.
 */

import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@froggy/ui/components/marker";
import { cn } from "@froggy/ui/lib/utils";
import { PiggyBankIcon, SnowflakeIcon, SunIcon } from "lucide-react";
import type { ReactElement } from "react";

import type { TimelineEvent } from "../../lib/app-state";
import { clockTime } from "../../lib/format";

const ICON: Record<TimelineEvent["kind"], typeof SunIcon> = {
  frozen: SnowflakeIcon,
  topup: PiggyBankIcon,
  unfrozen: SunIcon,
};

const TONE: Record<TimelineEvent["kind"], string> = {
  frozen: "text-drive-frozen",
  topup: "text-brand",
  unfrozen: "text-muted-foreground",
};

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
      variant={event.kind === "topup" ? "default" : "separator"}
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
    </Marker>
  );
};
