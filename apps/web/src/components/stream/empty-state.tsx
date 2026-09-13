import { Button, buttonVariants } from "@froggy/ui/components/button";
import { Link } from "@tanstack/react-router";
import { CoinsIcon, PlaneIcon, ShoppingBagIcon } from "lucide-react";
import type { ReactElement } from "react";

export const EmptyState = ({
  disabled,
  onSend,
}: {
  readonly disabled: boolean;
  readonly onSend: (text: string) => void;
}): ReactElement => (
  <section
    aria-label="Use Froggy here"
    data-slot="home-intro"
    className="flex flex-col gap-5 py-2 sm:gap-7"
  >
    <div className="flex items-center gap-3 sm:gap-6">
      <img
        src="/froggy/next-idea.png"
        alt=""
        width={160}
        height={160}
        className="size-20 shrink-0 object-contain sm:size-28"
      />
      <div>
        <p className="text-brand mb-2 text-[11px] font-semibold tracking-wider uppercase">
          Small frog. Big plans.
        </p>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-4xl">
          What can I help with?
        </h1>
        <p className="text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed">
          A little research. A trip to plan. Something worth finding.
        </p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link
        className={buttonVariants({ variant: "outline" })}
        to="/watchlist"
        search={{ discover: true }}
      >
        <CoinsIcon aria-hidden />
        Find tokens
      </Link>
      <Button
        disabled={disabled}
        variant="outline"
        onClick={() => {
          onSend(
            "Help me plan a trip. Ask where I want to go, my dates and budget first."
          );
        }}
      >
        <PlaneIcon aria-hidden />
        Plan a trip
      </Button>
      <Button
        disabled={disabled}
        variant="outline"
        onClick={() => {
          onSend(
            "Help me find something worth buying. Ask what I have in mind and my budget first."
          );
        }}
      >
        <ShoppingBagIcon aria-hidden />
        Find something good
      </Button>
    </div>
  </section>
);
