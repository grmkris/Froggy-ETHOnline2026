import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * Who has the page, said one way everywhere.
 *
 * Amber and breathing while the agent drives, blue and still while the person
 * does, a dotted grey when the wallet is frozen. The ring is the only signal:
 * no banner, no toast, so a glance at any surface — the inline card, the split
 * pane, the popped-out window — answers the same question the same way.
 */
export type DriveMode = "agent" | "frozen" | "human" | "idle";

const RING: Record<DriveMode, string> = {
  agent: "ring-drive-agent",
  frozen: "ring-drive-frozen",
  human: "ring-drive-human",
  idle: "ring-drive-idle",
};

const DOT: Record<DriveMode, string> = {
  agent: "bg-drive-agent",
  frozen: "bg-drive-frozen",
  human: "bg-drive-human",
  idle: "bg-border",
};

export const DRIVE_LABEL: Record<DriveMode, string> = {
  agent: "Agent is driving",
  frozen: "Frozen",
  human: "You have the page",
  idle: "Nobody driving",
};

function DrivingRing({
  className,
  mode,
  ...props
}: ComponentProps<"div"> & { readonly mode: DriveMode }) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius-lg)+2px)] transition-shadow duration-300",
        RING[mode],
        className
      )}
      data-drive={mode}
      data-slot="driving-ring"
      {...props}
    />
  );
}

function DrivingDot({
  className,
  mode,
  ...props
}: ComponentProps<"span"> & { readonly mode: DriveMode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 rounded-full",
        DOT[mode],
        mode === "agent" && "motion-safe:animate-pulse",
        className
      )}
      data-slot="driving-dot"
      {...props}
    />
  );
}

export { DrivingDot, DrivingRing };
