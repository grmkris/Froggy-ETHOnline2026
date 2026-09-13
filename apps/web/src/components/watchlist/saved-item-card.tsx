import type { WatchlistItem } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageCircleIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { useChatSurface } from "../../lib/chat-context";
import { ItemIcon, sourceWords } from "./item-identity";
import { ItemImage } from "./item-image";

/** Recorded identity can be reused in chat; live controls do not rewrite its facts. */
export const SavedItemCard = ({
  item,
  children,
  hasImage = false,
}: {
  readonly item: WatchlistItem;
  readonly children?: ReactNode;
  readonly hasImage?: boolean;
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
          {item.title}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {sourceWords(item)}
          {item.notes ? ` · ${item.notes}` : ""}
        </p>
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
