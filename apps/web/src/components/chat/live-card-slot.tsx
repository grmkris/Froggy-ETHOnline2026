/**
 * Where the live page sits in the column: inline, standing in for a window,
 * or nowhere because a pane beside the column holds it.
 */

import { Button } from "@froggy/ui/components/button";
import { motion } from "motion/react";
import type { ReactElement } from "react";

import type { PopOutMode } from "../../lib/pop-out-machine";

/** Stands in for the card while a window holds the page. */
const Elsewhere = ({
  onDock,
}: {
  readonly onDock: () => void;
}): ReactElement => (
  <div className="bg-card/60 shadow-card flex items-center gap-3 rounded-2xl p-4 text-sm">
    <span className="flex-1">The page is open in another window.</span>
    <Button onClick={onDock} size="sm" variant="outline">
      Bring it back
    </Button>
  </div>
);

export const LiveCardSlot = ({
  card,
  mode,
  onDock,
  onVisible,
  show,
}: {
  readonly card: ReactElement;
  readonly mode: PopOutMode;
  readonly onDock: () => void;
  readonly onVisible: (visible: boolean) => void;
  readonly show: boolean;
}): ReactElement | null => {
  if (!show) {
    return null;
  }
  if (mode === "window") {
    return <Elsewhere onDock={onDock} />;
  }
  if (mode === "split") {
    return null;
  }
  return (
    <motion.div
      onViewportEnter={() => {
        onVisible(true);
      }}
      onViewportLeave={() => {
        onVisible(false);
      }}
    >
      {card}
    </motion.div>
  );
};
