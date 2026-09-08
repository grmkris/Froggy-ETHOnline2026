import { motion, useIsPresent, useReducedMotion } from "motion/react";
import type { ReactElement, ReactNode } from "react";

import { keyboardInteraction, UI_EASE } from "../lib/motion";

/** Fade in place: never animate the scroller's geometry or an action's position. */
export const MotionItem = ({
  children,
  className,
  inline = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly inline?: boolean;
}): ReactElement => {
  const present = useIsPresent();
  const reduced = useReducedMotion() === true;
  const instant = keyboardInteraction();
  const Element = inline ? motion.span : motion.div;
  return (
    <Element
      animate={{ opacity: 1 }}
      className={className}
      exit={{ opacity: 0 }}
      inert={!present}
      initial={instant ? false : { opacity: reduced ? 0.6 : 0 }}
      transition={{ duration: instant ? 0 : 0.125, ease: UI_EASE }}
    >
      {children}
    </Element>
  );
};
