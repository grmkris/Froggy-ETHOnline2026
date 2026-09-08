import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { UI_EASE, UI_SPRING } from "../lib/motion";

/** Stagger only this arrival batch, capped so long histories never queue up. */
export const useArrivalDelays = (
  ids: readonly string[]
): ReadonlyMap<string, number> => {
  const [batch, setBatch] = useState(() => ({
    ids,
    delays: new Map(ids.map((id, index) => [id, Math.min(index, 5) * 0.035])),
  }));
  if (
    ids.length !== batch.ids.length ||
    ids.some((id, index) => id !== batch.ids[index])
  ) {
    const added = ids.filter((id) => !batch.ids.includes(id));
    const delays = new Map(
      added.map((id, index) => [id, Math.min(index, 5) * 0.035])
    );
    setBatch({ ids, delays });
    return delays;
  }
  return batch.delays;
};

/** Arrivals have weight; reading geometry and existing cards never reflow. */
export const MotionItem = ({
  children,
  className,
  delay = 0,
  inline = false,
  spring = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
  readonly inline?: boolean;
  readonly spring?: boolean;
}): ReactElement => {
  const present = useIsPresent();
  const reduced = useReducedMotion() === true;
  const Element = inline ? motion.span : motion.div;
  const transform = reduced || inline ? "none" : "translateY(0px) scale(1)";
  return (
    <Element
      animate={{ opacity: 1, transform }}
      className={className}
      data-slot="motion-item"
      data-arrival={spring ? "spring" : "rise"}
      exit={{ opacity: 0, transition: { duration: 0.125 } }}
      inert={!present}
      initial={{
        opacity: 0,
        transform:
          reduced || inline
            ? "none"
            : `translateY(12px) scale(${spring ? 0.97 : 1})`,
      }}
      transition={
        reduced
          ? { duration: 0.125 }
          : {
              ...(spring ? UI_SPRING : { duration: 0.24, ease: UI_EASE }),
              delay,
              opacity: { duration: 0.24, delay, ease: UI_EASE },
            }
      }
    >
      {children}
    </Element>
  );
};
