import { spring } from "motion/react";

/** Match the shared CSS vocabulary; keyboard navigation never waits for motion. */
export const UI_EASE = [0.23, 1, 0.32, 1] as const;

export const UI_SPRING = {
  type: "spring",
  duration: 0.3,
  bounce: 0.2,
} as const;

export const keyboardInteraction = (): boolean =>
  document.documentElement.dataset["motionInput"] === "keyboard";

/** Inspect only the pressed branch, never every fading word in a long conversation. */
const animationsAbove = (target: EventTarget | null): Animation[] => {
  const animations: Animation[] = [];
  let element = target instanceof Element ? target : null;
  while (element !== null) {
    animations.push(...element.getAnimations());
    element = element.parentElement;
  }
  return animations;
};

export const initializeMotionInput = (): void => {
  const held = new Set<number>();
  const paused = new Set<Animation>();
  const release = (event: PointerEvent): void => {
    held.delete(event.pointerId);
    if (held.size > 0) {
      return;
    }
    for (const animation of paused) {
      animation.play();
    }
    paused.clear();
  };
  window.addEventListener("blur", () => {
    held.clear();
    for (const animation of paused) {
      animation.play();
    }
    paused.clear();
  });
  document.addEventListener("focusin", (event) => {
    if (!keyboardInteraction()) {
      return;
    }
    for (const animation of animationsAbove(event.target)) {
      const { effect } = animation;
      if (
        effect instanceof KeyframeEffect &&
        effect.target instanceof Element &&
        event.target instanceof Node &&
        effect.target.contains(event.target) &&
        effect.getComputedTiming().endTime !== Infinity
      ) {
        animation.finish();
      }
    }
  });
  document.addEventListener("pointerup", release, { capture: true });
  document.addEventListener("pointercancel", release, { capture: true });
  document.documentElement.style.setProperty(
    "--motion-spring",
    spring({ keyframes: [0, 1], duration: 300, bounce: 0.2 }).toString()
  );
  document.documentElement.style.setProperty(
    "--motion-press",
    spring({ keyframes: [0, 1], duration: 240, bounce: 0.2 }).toString()
  );
  document.documentElement.dataset["motionInput"] = "initial";
  document.addEventListener(
    "keydown",
    () => {
      document.documentElement.dataset["motionInput"] = "keyboard";
    },
    { capture: true }
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      document.documentElement.dataset["motionInput"] = "pointer";
      held.add(event.pointerId);
      // Freeze the presentation where the finger landed, including ancestor entrances.
      for (const animation of animationsAbove(event.target)) {
        const { effect } = animation;
        if (
          effect instanceof KeyframeEffect &&
          effect.target instanceof Element &&
          !effect.target.classList.contains("press-feedback") &&
          event.target instanceof Node &&
          effect.target.contains(event.target) &&
          animation.playState === "running" &&
          effect.getTiming().iterations !== Infinity
        ) {
          animation.pause();
          paused.add(animation);
        }
      }
    },
    { capture: true, passive: true }
  );
};
