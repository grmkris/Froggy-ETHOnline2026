/** One sentence under the hero when the Inbox has unread updates; nothing when it has none. */

import { cn } from "@froggy/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useUpdatesPage } from "../../lib/updates-client";

export const InboxNudge = ({
  className = "home-nudge",
}: {
  readonly className?: string;
}): ReactElement | null => {
  const updates = useUpdatesPage();
  const unread = updates.data?.unread ?? 0;
  if (unread === 0) {
    return null;
  }
  return (
    <Link
      className={cn("playground-eyebrow", className)}
      search={{ feed: "updates" }}
      to="/inbox"
    >
      {unread} new {unread === 1 ? "update" : "updates"} in your Inbox ↗
    </Link>
  );
};
