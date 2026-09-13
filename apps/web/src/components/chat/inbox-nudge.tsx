/** One sentence under the hero when the Inbox has unread updates; nothing when it has none. */

import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useUpdatesPage } from "../../lib/updates-client";

export const InboxNudge = (): ReactElement | null => {
  const updates = useUpdatesPage();
  const unread = updates.data?.unread ?? 0;
  if (unread === 0) {
    return null;
  }
  return (
    <Link
      className="playground-eyebrow home-nudge"
      search={{ feed: "updates" }}
      to="/inbox"
    >
      {unread} new {unread === 1 ? "update" : "updates"} in your Inbox ↗
    </Link>
  );
};
