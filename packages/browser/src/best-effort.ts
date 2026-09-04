/**
 * "Try this; if it fails, carry on."
 *
 * This package is full of commands whose failure is genuinely not worth
 * propagating: acking a screencast frame for a tab that has since closed,
 * stopping a cast on a crashed renderer, enabling a CDP domain a particular
 * Chrome build does not have. Each of those degrades the surface a little and
 * none of them should end a turn.
 *
 * It exists as one named helper rather than a scattering of
 * `.catch(() => undefined)` so that swallowing an error is a deliberate,
 * greppable act. `grep -c bestEffort` is a real measure of how much this
 * package is choosing not to know.
 */
export const bestEffort = async (
  /** Optional so `tab?.send(...)` can be passed straight through. */
  work: Promise<unknown> | undefined
): Promise<void> => {
  if (work === undefined) {
    return;
  }
  try {
    await work;
  } catch {
    // Deliberately swallowed. See the module comment above: the caller has
    // already decided this operation is optional.
  }
};
