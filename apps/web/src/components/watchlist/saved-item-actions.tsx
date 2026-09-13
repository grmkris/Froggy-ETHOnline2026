import type { WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@froggy/ui/components/collapsible";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import type { ReactElement } from "react";

import { MonitorSetup } from "./monitoring-panel";

export const SavedItemActions = ({
  item,
}: {
  readonly item: WatchlistItem;
}): ReactElement => (
  <Collapsible className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <output className="saved-feedback text-brand flex min-h-11 items-center gap-2 text-sm font-medium">
        <CheckIcon className="size-4" aria-hidden />
        Saved
      </output>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link to="/watchlist/$itemId" params={{ itemId: item.id }} />}
      >
        Open item
      </Button>
      {item.source._tag === "email" || item.source._tag === "wallet" ? null : (
        <CollapsibleTrigger render={<Button variant="ghost" />}>
          Add alert
        </CollapsibleTrigger>
      )}
    </div>
    <CollapsibleContent className="watchlist-alert-panel">
      {item.source._tag !== "wallet" && item.source._tag !== "email" ? (
        <MonitorSetup
          item={item}
          onDone={() => {
            // Keep the saved confirmation visible after adding an alert.
          }}
        />
      ) : null}
    </CollapsibleContent>
  </Collapsible>
);
