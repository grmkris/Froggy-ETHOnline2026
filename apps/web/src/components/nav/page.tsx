/** A page that scrolls on its own, with one heading, in the column the chat uses. */

import { cn } from "@froggy/ui/lib/utils";
import type { ReactElement, ReactNode } from "react";

export const Page = ({
  children,
  intro,
  slot,
  title,
  titleHidden = false,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly intro?: string;
  /** A `data-slot` for tests that watch the scroll position. */
  readonly slot?: string;
  readonly title: string;
  /** For a page whose first section already says what it is. */
  readonly titleHidden?: boolean;
  readonly wide?: boolean;
}): ReactElement => (
  <article
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    data-slot={slot}
  >
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-8 sm:py-10",
        wide ? "max-w-6xl" : "max-w-4xl"
      )}
    >
      <header className={titleHidden ? "sr-only" : undefined}>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {intro === undefined ? null : (
          <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
            {intro}
          </p>
        )}
      </header>
      {children}
    </div>
  </article>
);
