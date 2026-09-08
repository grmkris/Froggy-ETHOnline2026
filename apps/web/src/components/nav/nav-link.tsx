/** Router-owned current-page state, with a waiting badge that reserves no layout. */
import { cn } from "@froggy/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { NavItem } from "../../lib/nav";

export const NAV_LINK_CLASS =
  "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring data-[status=active]:bg-card data-[status=active]:text-brand data-[status=active]:shadow-control relative flex min-h-12 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset active:bg-muted";

export const NavLink = ({
  item,
  more = false,
  onNavigate,
  waiting = 0,
}: {
  readonly item: NavItem;
  readonly more?: boolean;
  readonly onNavigate?: () => void;
  readonly waiting?: number;
}): ReactElement => {
  const Icon = item.icon;
  const name =
    waiting > 0
      ? `${item.label}, ${waiting} approval${waiting === 1 ? "" : "s"} waiting`
      : item.label;
  return (
    <Link
      activeOptions={{ exact: item.to === "/" }}
      aria-label={name}
      className={cn(
        NAV_LINK_CLASS,
        more && "flex-row justify-start gap-3 rounded-lg px-3 text-sm"
      )}
      onClick={onNavigate}
      to={item.to}
    >
      <span className="relative">
        <Icon aria-hidden className="size-5" />
        {waiting > 0 ? (
          <span
            aria-hidden
            className="bg-drive-agent absolute -top-0.5 -right-0.5 size-2 rounded-full"
          />
        ) : null}
      </span>
      <span aria-hidden>{item.label}</span>
    </Link>
  );
};
