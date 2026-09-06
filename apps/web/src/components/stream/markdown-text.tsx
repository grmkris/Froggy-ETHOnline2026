/**
 * The agent's words, rendered as markdown while they are still arriving.
 *
 * Streamdown repairs the unterminated block at the tail of a stream, so a
 * half-written table is a table and not a row of pipes. A finished message
 * renders in static mode, which skips the streaming machinery. The text is
 * the model's, not ours, and the model may have just read a page that wanted
 * to be rendered: links open in a new tab and only over http(s) or mailto,
 * images and raw HTML are dropped, and the only control left on is the copy
 * button on a code block.
 */

import { useReducedMotion } from "motion/react";
import { memo } from "react";
import type { ReactElement, ReactNode } from "react";
import { Streamdown } from "streamdown";
import type { ExtraProps } from "streamdown";

import "streamdown/styles.css";

interface MarkdownTextProps {
  /** Still streaming: repair the tail and reveal words as they land. */
  readonly live: boolean;
  readonly text: string;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The href as written when it is absolute and over a protocol we open. */
const safeHref = (href: string | undefined): string | null => {
  if (href === undefined || !URL.canParse(href)) {
    return null;
  }
  return SAFE_PROTOCOLS.has(new URL(href).protocol) ? href : null;
};

/**
 * A link the model wrote: opened in a new tab, or left as plain words.
 *
 * The `ExtraProps` half is what makes this assignable to Streamdown's
 * `Components`, whose index signature wants a property in common.
 */
const SafeLink = ({
  children,
  href,
}: ExtraProps & {
  readonly children?: ReactNode | undefined;
  readonly href?: string | undefined;
}): ReactElement => {
  const safe = safeHref(href);
  return safe === null ? (
    <span>{children}</span>
  ) : (
    <a
      className="text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-2"
      href={safe}
      rel="noopener noreferrer nofollow"
      target="_blank"
    >
      {children}
    </a>
  );
};

const CONTROLS = {
  code: { copy: true, download: false },
  image: false,
  mermaid: false,
  table: false,
} as const;

const NO_IMAGES = ["img"] as const;

const MarkdownTextBase = ({ live, text }: MarkdownTextProps): ReactElement => {
  const reduced = useReducedMotion() === true;
  return (
    <Streamdown
      animated={live && !reduced}
      className="[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display min-w-0 [&_code]:font-mono max-sm:[&_td]:whitespace-nowrap"
      components={{ a: SafeLink }}
      controls={CONTROLS}
      disallowedElements={NO_IMAGES}
      isAnimating={live}
      linkSafety={{ enabled: false }}
      mode={live ? "streaming" : "static"}
      skipHtml
    >
      {text}
    </Streamdown>
  );
};

/** Memoised: every token re-renders the turn, and only the live part changes. */
export const MarkdownText = memo(MarkdownTextBase);
