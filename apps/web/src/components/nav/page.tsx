/** A page that scrolls on its own, with one heading, in the column the chat uses. */

import type { ReactElement, ReactNode } from "react";

export const Page = ({
  children,
  intro,
  slot,
  title,
  titleHidden = false,
}: {
  readonly children: ReactNode;
  readonly intro?: string;
  /** A `data-slot` for tests that watch the scroll position. */
  readonly slot?: string;
  readonly title: string;
  /** For a page whose first section already says what it is. */
  readonly titleHidden?: boolean;
}): ReactElement => (
  <article
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    data-slot={slot}
  >
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className={titleHidden ? "sr-only" : undefined}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {intro === undefined ? null : (
          <p className="text-muted-foreground mt-1 text-sm">{intro}</p>
        )}
      </header>
      {children}
    </div>
  </article>
);
