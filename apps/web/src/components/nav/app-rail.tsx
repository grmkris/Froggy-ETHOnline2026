/**
 * The desktop rail: three destinations, with the secondary places demoted to
 * the foot rather than hidden. One landmark — the pill is not rendered at this
 * width, so assistive technology sees a single primary navigation.
 */

import type { Conversation } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import { MessageCircleIcon } from "lucide-react";
import type { ReactElement } from "react";

import { useHistoryPage } from "../../lib/history-client";
import { NAV_ITEMS } from "../../lib/nav";
import { RecentConversations } from "../chat/recent-conversations";

const ROW =
  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-[var(--radius-row)] px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2";

export const AppRail = ({
  waiting,
}: {
  /** Approvals open, shown as a count on Home rather than a bare dot. */
  readonly waiting: number;
}): ReactElement => {
  const history = useHistoryPage("/api/conversations?limit=6&q=");
  const recent = history.records.filter(
    (record): record is Conversation => record.kind === "conversation"
  );
  const pathname = useLocation({ select: (location) => location.pathname });
  const isHome = (to: string): boolean =>
    to === "/" ? pathname === "/" || pathname.startsWith("/chat") : false;
  return (
    <nav
      aria-label="Primary"
      className="border-border bg-background flex w-56 shrink-0 flex-col gap-1 border-r p-4"
      data-slot="navigation-rail"
    >
      <span className="flex items-center gap-2 px-2 pt-1 pb-3.5 text-[17px] font-semibold tracking-[-0.025em]">
        <FrogMark className="size-6" compact />
        Froggy
      </span>
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.to ||
          isHome(item.to) ||
          (item.to === "/watchlist" && pathname.startsWith("/watchlist/"));
        const Icon = item.icon;
        // The count belongs in the accessible name, not only in the badge:
        // "Home" and "Home, 1 approval waiting" are different places to a
        // screen reader, and the same place to a glance.
        const name =
          item.to === "/" && waiting > 0
            ? `${item.label}, ${waiting} approval${waiting === 1 ? "" : "s"} waiting`
            : item.label;
        return (
          <Link
            activeOptions={{ exact: item.to === "/" }}
            aria-current={active ? "page" : undefined}
            aria-label={name}
            className={cn(ROW, active && "bg-brand-soft text-brand")}
            key={item.to}
            to={item.to}
          >
            <Icon aria-hidden className="size-[18px]" />
            {item.label}
            {item.to === "/" && waiting > 0 ? (
              <span className="bg-lime text-lime-ink ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold">
                {waiting}
              </span>
            ) : null}
          </Link>
        );
      })}
      <RecentConversations />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between px-3">
          <h2 className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
            Conversations
          </h2>
        </div>
        {recent.map((record) => (
          <Link
            key={record.id}
            params={{ conversationId: record.id }}
            to="/chat/$conversationId"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs outline-none focus-visible:ring-2"
          >
            <MessageCircleIcon aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{record.title}</span>
          </Link>
        ))}
        {history.isError ? (
          <div className="text-muted-foreground px-3 text-xs" role="alert">
            <p>History could not be loaded.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void history.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {recent.length === 0 && !history.isError && !history.isPending ? (
          <p className="text-muted-foreground px-3 text-xs leading-relaxed">
            A little research. A big idea. It starts with a chat.
          </p>
        ) : null}
      </div>
    </nav>
  );
};
