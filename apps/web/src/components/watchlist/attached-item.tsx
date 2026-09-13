import { Button } from "@froggy/ui/components/button";
import { BookmarkIcon, XIcon } from "lucide-react";
import type { ReactElement } from "react";

import { useChatSurface } from "../../lib/chat-context";

export const AttachedItem = (): ReactElement | null => {
  const { attachedItem, attachItem } = useChatSurface();
  if (attachedItem === null) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="bg-brand-soft text-brand flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 pl-3 text-xs">
        <BookmarkIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{attachedItem.title}</span>
        <Button
          aria-label="Remove attached item"
          className="size-11"
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            attachItem(null);
          }}
        >
          <XIcon />
        </Button>
      </span>
    </div>
  );
};
