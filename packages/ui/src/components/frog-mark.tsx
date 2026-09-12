import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * The mark. Drawn rather than an emoji, so it is the same frog on every
 * platform and at every size — an emoji is whatever font the viewer has.
 *
 * `pose` is the semantic motion contract, not a set of animation names: the
 * caller maps a task's state to one of these and sets a single value. Poses are
 * static here; the differences are real geometry rather than colour alone, so
 * they survive reduced motion and greyscale. `stopped` is deliberately calm
 * rather than sad, because it also means "outcome not yet known", and a
 * dejected frog would be lying at the moment a person is most likely to do
 * something expensive out of anxiety.
 *
 * Detail that cannot survive small sizes is dropped rather than scaled: below
 * roughly 40px pass `compact` and the jaw shading and nostrils go, leaving the
 * silhouette and the eyes to carry the identity.
 */
export type FrogPose =
  | "idle"
  | "working"
  | "needs-user"
  | "success"
  | "stopped";

/** How far the eyelid travels. The lid spans y −3..13 and the eye 12.8..27.2. */
const LID = { open: -2, half: 7 } as const;

function FrogMark({
  className,
  compact = false,
  pose = "idle",
  ...props
}: ComponentProps<"svg"> & {
  readonly compact?: boolean;
  readonly pose?: FrogPose;
}) {
  const lid = pose === "stopped" ? LID.half : LID.open;
  const open = pose === "success";
  const scan = pose === "working" ? 1.7 : 0;
  return (
    <svg
      aria-hidden="true"
      className={cn("size-6 overflow-visible", className)}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      data-pose={pose}
    >
      {pose === "needs-user" ? (
        <circle
          cx="32"
          cy="34"
          r="30"
          fill="none"
          opacity="0.55"
          stroke="var(--frog-lime)"
          strokeWidth="2"
        />
      ) : null}
      <path
        d="M32 23c15 0 27 7 27 16.5S47 55.5 32 55.5 5 49.5 5 39.5 17 23 32 23Z"
        fill="var(--frog-skin)"
      />
      {compact ? null : (
        <>
          <ellipse
            cx="32"
            cy="47.5"
            fill="var(--frog-belly)"
            opacity="0.45"
            rx="16"
            ry="6.2"
          />
          <circle cx="28" cy="32.5" fill="var(--frog-skin-lo)" r="0.95" />
          <circle cx="36" cy="32.5" fill="var(--frog-skin-lo)" r="0.95" />
        </>
      )}
      {[18, 46].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="20" fill="var(--frog-skin)" r="10.5" />
          <circle cx={cx} cy="20" fill="var(--frog-eye)" r="7.2" />
          <g transform={`translate(${scan} 0)`}>
            <circle cx={cx} cy="20" fill="var(--frog-pupil)" r="3.6" />
            <circle
              cx={cx - 1.4}
              cy="18.4"
              fill="var(--frog-eye)"
              opacity="0.92"
              r="1.35"
            />
          </g>
          <clipPath id={`frog-lid-${cx}`}>
            <circle cx={cx} cy="20" r="7.2" />
          </clipPath>
          <g clipPath={`url(#frog-lid-${cx})`}>
            <rect
              fill="var(--frog-skin)"
              height="16"
              transform={`translate(0 ${lid})`}
              width="16"
              x={cx - 8}
              y="-3"
            />
          </g>
        </g>
      ))}
      {open ? (
        <g>
          <clipPath id="frog-maw">
            <path d="M21.5 38Q32 52 42.5 38Z" />
          </clipPath>
          <path d="M21.5 38Q32 52 42.5 38Z" fill="var(--frog-mouth)" />
          <ellipse
            clipPath="url(#frog-maw)"
            cx="32"
            cy="44.4"
            fill="var(--frog-lime)"
            rx="5"
            ry="2.6"
          />
        </g>
      ) : (
        <path
          d="M22.5 39.5Q32 45.5 41.5 39.5"
          stroke="var(--frog-mouth)"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      )}
    </svg>
  );
}

export { FrogMark };
