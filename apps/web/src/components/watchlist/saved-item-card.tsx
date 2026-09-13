import type { WatchlistData, WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageCircleIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useChatSurface } from "../../lib/chat-context";
import { ItemIcon, ItemPresence, displayTitle } from "./item-identity";
import { ItemImage } from "./item-image";

/** Recorded identity can be reused in chat; live controls do not rewrite its facts. */
export const SavedItemCard = ({
  item,
  children,
  hasImage = false,
  data,
}: {
  readonly item: WatchlistItem;
  readonly children?: ReactNode;
  readonly hasImage?: boolean;
  readonly data?: WatchlistData | undefined;
}): ReactElement => {
  const { attachItem } = useChatSurface();
  const navigate = useNavigate();
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3 p-4">
      {hasImage ? (
        <ItemImage id={item.id} title={item.title} compact />
      ) : (
        <ItemIcon item={item} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="focus-visible:ring-ring min-h-11 content-center truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2"
          to="/watchlist/$itemId"
          params={{ itemId: item.id }}
        >
          <span
            key={displayTitle(item, data?.presence)}
            className="presence-text"
          >
            {displayTitle(item, data?.presence)}
          </span>
        </Link>
        <ItemPresence item={item} data={data} />
        {children}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Ask Froggy about ${item.title}`}
        onClick={() => {
          attachItem(item);
          void navigate({ to: "/" });
        }}
      >
        <MessageCircleIcon aria-hidden />
      </Button>
    </div>
  );
};
