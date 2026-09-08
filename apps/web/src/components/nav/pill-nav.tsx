import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@froggy/ui/components/popover";
import { useLocation } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ReactElement } from "react";

import { NAV_ITEMS } from "../../lib/nav";
import { NAV_LINK_CLASS, NavLink } from "./nav-link";

const PRIMARY = NAV_ITEMS.slice(0, 3);
const MORE = NAV_ITEMS.slice(3);

/** One landmark at every width; the popover stays inside it for assistive technology. */
export const PillNav = ({
  waiting,
}: {
  readonly waiting: number;
}): ReactElement => {
  const nav = useRef<HTMLElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const currentMore = MORE.find((item) => item.to === pathname);
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-[max(0.75rem,env(safe-area-inset-left),env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      ref={nav}
    >
      <div
        data-slot="navigation-pill"
        className="bg-paper-deep/95 shadow-float pointer-events-auto grid w-full max-w-sm grid-cols-4 gap-1 rounded-full p-1.5 backdrop-blur-md"
      >
        {PRIMARY.map((item) => (
          <NavLink
            item={item}
            key={item.to}
            waiting={item.to === "/" ? waiting : 0}
          />
        ))}
        <Popover
          onOpenChange={(next) => {
            setOpenPath(next ? pathname : null);
          }}
          open={open}
        >
          <PopoverTrigger
            aria-current={
              currentMore !== undefined && !open ? "page" : undefined
            }
            aria-label={
              currentMore === undefined ? "More" : `More, ${currentMore.label}`
            }
            className={NAV_LINK_CLASS}
            data-status={currentMore === undefined ? "inactive" : "active"}
          >
            <EllipsisIcon aria-hidden className="size-5" />
            <span aria-hidden>More</span>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            container={nav}
            side="top"
            sideOffset={12}
          >
            <PopoverTitle className="text-muted-foreground px-3 pt-1 pb-2 text-xs">
              More places
            </PopoverTitle>
            {MORE.map((item) => (
              <NavLink
                item={item}
                key={item.to}
                more
                onNavigate={() => {
                  setOpenPath(null);
                }}
              />
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
};
