import type { ReactElement } from "react";

import { NAV_ITEMS } from "../../lib/nav";
import { NavLink } from "./nav-link";

export const PillNav = ({
  waiting,
}: {
  readonly waiting: number;
}): ReactElement => (
  <nav
    aria-label="Primary"
    data-slot="mobile-navigation"
    className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-30 flex justify-center border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
  >
    <div
      data-slot="navigation-pill"
      className="grid w-full max-w-sm grid-cols-3 gap-2"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          item={item}
          key={item.to}
          waiting={item.to === "/" ? waiting : 0}
        />
      ))}
    </div>
  </nav>
);
