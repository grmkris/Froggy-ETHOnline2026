/**
 * Bring the live page into view.
 *
 * One function for the header's globe, the strip's jump and a paid card's
 * "show the page", so they cannot drift apart. The ring is the card's frame;
 * scrolling to it centres the page.
 */
export const scrollToLive = (): void => {
  document
    .querySelector('[data-slot="driving-ring"]')
    ?.scrollIntoView({ behavior: "instant", block: "center" });
};
