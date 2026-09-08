/** Match the shared CSS vocabulary; keyboard navigation never waits for motion. */
export const UI_EASE = [0.23, 1, 0.32, 1] as const;

export const keyboardInteraction = (): boolean =>
  document.documentElement.dataset["motionInput"] === "keyboard";

export const initializeMotionInput = (): void => {
  document.documentElement.dataset["motionInput"] = "keyboard";
  document.addEventListener(
    "keydown",
    () => {
      document.documentElement.dataset["motionInput"] = "keyboard";
    },
    { capture: true }
  );
  document.addEventListener(
    "pointerdown",
    () => {
      document.documentElement.dataset["motionInput"] = "pointer";
    },
    { capture: true, passive: true }
  );
};
