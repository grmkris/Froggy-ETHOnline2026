/** The desktop navigation: a narrow rail with the mark on top. */

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
    className="bg-paper-deep flex w-18 shrink-0 flex-col items-stretch gap-1 border-r px-2 py-3"
  >
    <div className="mb-3 flex flex-col items-center gap-1">
      <span className="bg-brand-soft grid size-9 place-items-center rounded-xl">
        <FrogMark className="size-7" />
      </span>
      <span className="font-display text-[11px] font-semibold">Froggy</span>
    </div>
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
