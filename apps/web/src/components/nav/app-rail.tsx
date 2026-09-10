/**
 * The desktop rail: three destinations, with the secondary places demoted to
 * the foot rather than hidden. One landmark — the pill is not rendered at this
 * width, so assistive technology sees a single primary navigation.
 */

import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { NAV_ITEMS, SECONDARY_ITEMS } from "../../lib/nav";

const ROW =
  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-2.5 rounded-[var(--radius-row)] px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-2";

export const AppRail = ({
  waiting,
}: {
  /** Approvals open, shown as a count on Home rather than a bare dot. */
  readonly waiting: number;
}): ReactElement => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isHome = (to: string): boolean =>
    to === "/" ? pathname === "/" || pathname.startsWith("/chat") : false;
  return (
    <nav
      aria-label="Primary"
      className="border-border bg-card flex w-52 shrink-0 flex-col gap-1 border-r p-3"
      data-slot="navigation-rail"
    >
      <span className="flex items-center gap-2 px-2 pt-1 pb-3.5 text-[17px] font-semibold tracking-[-0.025em]">
        <FrogMark className="size-6" compact />
        Froggy
      </span>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.to || isHome(item.to);
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
      <span className="border-border mt-auto grid gap-0.5 border-t pt-2.5">
        {SECONDARY_ITEMS.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(ROW, "text-xs", active && "text-brand")}
              key={item.to}
              to={item.to}
            >
              <Icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </span>
    </nav>
  );
};
