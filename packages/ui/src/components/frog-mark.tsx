import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * The mark. Drawn rather than an emoji, so it is the same frog on every
 * platform and at every size — an emoji is whatever font the viewer has.
 */
function FrogMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6", className)}
      fill="none"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M4 19c0-5.5 5.4-9 12-9s12 3.5 12 9-5.4 9-12 9S4 24.5 4 19Z"
        fill="oklch(0.55 0.15 145)"
      />
      <circle cx="10" cy="11" fill="oklch(0.55 0.15 145)" r="5" />
      <circle cx="22" cy="11" fill="oklch(0.55 0.15 145)" r="5" />
      <circle cx="10" cy="11" fill="white" r="3.2" />
      <circle cx="22" cy="11" fill="white" r="3.2" />
      <circle cx="10.6" cy="11.4" fill="oklch(0.2 0.03 150)" r="1.6" />
      <circle cx="22.6" cy="11.4" fill="oklch(0.2 0.03 150)" r="1.6" />
      <path
        d="M10 21.5c2 2 10 2 12 0"
        stroke="oklch(0.2 0.03 150)"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export { FrogMark };
