/** The phone navigation: five tabs along the bottom, clear of the home indicator. */

import type { ReactElement } from "react";

import { NAV_ITEMS } from "../../lib/nav";
import { NavLink } from "./nav-link";

export const TabBar = ({
  waiting,
}: {
  readonly waiting: number;
}): ReactElement => (
  <nav
    aria-label="Primary"
    className="bg-background/95 fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    {NAV_ITEMS.map((item) => (
      <NavLink
        edge="top"
        item={item}
        key={item.to}
        waiting={item.to === "/" ? waiting : 0}
      />
    ))}
  </nav>
);
