/**
 * Text that morphs into its next value instead of flashing.
 *
 * A balance that changes from $0.00 to $12.48 should read as the same number
 * moving, not as one string replaced by another; a status word should slide
 * into the next one. Torph does that per character, and by place value for
 * numbers, and holds the plain value for assistive technology. It honours
 * `prefers-reduced-motion` on its own, in which case this is a plain element.
 */

import type { ReactElement, ReactNode } from "react";
import { TextMorph } from "torph/react";

interface MorphTextProps {
  /** The element to render; a span unless the layout needs a block. */
  readonly as?: "dd" | "p" | "span" | "td";
  readonly children: ReactNode;
  readonly className?: string;
}

export const MorphText = ({
  as = "span",
  children,
  className,
}: MorphTextProps): ReactElement => (
  <TextMorph
    as={as}
    duration={600}
    ease="cubic-bezier(0.23, 1, 0.32, 1)"
    numbers
    respectReducedMotion
    {...(className === undefined ? {} : { className })}
  >
    {children}
  </TextMorph>
);
