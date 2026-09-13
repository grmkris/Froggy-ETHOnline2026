import { cn } from "@froggy/ui/lib/utils";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { NavItem } from "../../lib/nav";

export const NavLink = ({
  item,
  waiting = 0,
}: {
  readonly item: NavItem;
  readonly waiting?: number;
}): ReactElement => {
  const path = useLocation({ select: (location) => location.pathname });
  const active =
    item.to === "/"
      ? path === "/" || path.startsWith("/chat")
      : path.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={
        waiting > 0
          ? `${item.label}, ${waiting} approval${waiting === 1 ? "" : "s"} waiting`
          : item.label
      }
      className={cn(
        "focus-visible:ring-ring flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2",
        active
          ? "bg-brand-soft text-brand"
          : "text-muted-foreground hover:bg-muted"
      )}
      to={item.to}
    >
      <span className="relative">
        <Icon aria-hidden className="size-5" />
        {waiting > 0 ? (
          <span
            aria-hidden
            className="bg-drive-agent absolute -top-1 -right-1 size-2 rounded-full"
          />
        ) : null}
      </span>
      {item.label}
    </Link>
  );
};
