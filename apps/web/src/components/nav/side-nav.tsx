/** The desktop navigation: labels on a desktop, a compact rail on a tablet. */

import { FrogMark } from "@froggy/ui/components/frog-mark";
import type { ReactElement } from "react";

import { NAV_ITEMS } from "../../lib/nav";
import { NavLink } from "./nav-link";

export const SideNav = ({
  waiting,
}: {
  readonly waiting: number;
}): ReactElement => (
  <nav
    aria-label="Primary"
    className="bg-paper-deep flex w-18 shrink-0 flex-col items-stretch gap-1 border-r px-2 py-5 lg:w-52 lg:px-4 lg:py-7"
  >
    <div className="mb-6 flex flex-col items-center gap-1 lg:flex-row lg:gap-3 lg:px-2">
      <span className="bg-brand-soft grid size-9 place-items-center rounded-xl">
        <FrogMark className="size-7" />
      </span>
      <span className="font-display text-[11px] font-semibold lg:text-2xl">
        Froggy
      </span>
    </div>
    <p className="text-muted-foreground mb-2 hidden px-3 text-[10px] font-medium tracking-[0.16em] uppercase lg:block">
      Workspace
    </p>
    {NAV_ITEMS.map((item) => (
      <NavLink
        edge="left"
        item={item}
        key={item.to}
        waiting={item.to === "/" ? waiting : 0}
      />
    ))}
  </nav>
);
