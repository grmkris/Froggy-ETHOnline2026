import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CompassIcon,
  ShoppingBagIcon,
  ChartNoAxesCombinedIcon,
  ClockIcon,
} from "lucide-react";

import { Page } from "../components/nav/page";
import { ScheduleList } from "../components/settings/schedule-list";

const TOOLS = [
  {
    title: "Services",
    description:
      "Research, browse, and create with a clear price and a saved result.",
    icon: CompassIcon,
    view: undefined,
  },
  {
    title: "Trading",
    description:
      "Review a trade, follow your positions, and manage your rules.",
    icon: ChartNoAxesCombinedIcon,
    view: "trading",
  },
  {
    title: "Purchases",
    description: "Review purchase requests and follow their receipts.",
    icon: ShoppingBagIcon,
    view: "purchases",
  },
  {
    title: "Scheduled work",
    description: "Follow launch watches and work running on a schedule.",
    icon: ClockIcon,
    view: "scheduled",
  },
] as const;
export const ExplorePage = () => (
  <Page
    title="Tools"
    intro="A little help for whatever you have in mind."
    slot="explore-page"
    wide
  >
    <div className="grid gap-4 sm:grid-cols-2">
      {TOOLS.map((tool) => (
        <Link
          key={tool.title}
          to="/services"
          search={tool.view ? { view: tool.view } : {}}
          className="group bg-card hover:border-brand focus-visible:ring-ring flex min-w-0 flex-col gap-5 rounded-2xl border p-6 outline-none focus-visible:ring-2"
        >
          <div className="flex items-center justify-between">
            <tool.icon aria-hidden className="text-brand size-6" />
            <ArrowUpRightIcon
              aria-hidden
              className="text-muted-foreground size-4"
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{tool.title}</h2>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              {tool.description}
            </p>
          </div>
        </Link>
      ))}
    </div>
    <section aria-label="Upcoming work" className="mt-2 flex flex-col gap-4">
      <h2 className="text-section">Coming up</h2>
      <ScheduleList compact />
    </section>
    <Link
      to="/activity"
      className="text-brand inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium"
    >
      View all activity
      <ArrowUpRightIcon aria-hidden className="size-4" />
    </Link>
  </Page>
);
