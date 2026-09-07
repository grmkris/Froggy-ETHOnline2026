/**
 * One place in the navigation.
 *
 * The router marks the active link with `data-status="active"` and
 * `aria-current="page"`; the colour and the edge mark both read it, so the
 * active place is never told by motion alone. A dot on Chat means a question
 * is waiting there, and the accessible name says so.
 */

import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import type { NavItem } from "../../lib/nav";

const EDGE = {
  left: "after:top-2 after:bottom-2 after:left-0 after:w-0.5",
  top: "after:top-0 after:right-3 after:left-3 after:h-0.5",
} as const;

export const NavLink = ({
  edge,
  item,
  waiting = 0,
}: {
  readonly edge: keyof typeof EDGE;
  readonly item: NavItem;
  /** Questions waiting on this page, when it is the chat. */
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
      className={`text-muted-foreground hover:bg-card/70 hover:text-foreground focus-visible:ring-ring data-[status=active]:bg-card data-[status=active]:text-brand data-[status=active]:shadow-card after:bg-brand relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors duration-150 outline-none after:absolute after:rounded-full after:opacity-0 after:transition-opacity after:duration-150 focus-visible:ring-2 data-[status=active]:after:opacity-100 ${EDGE[edge]}`}
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
