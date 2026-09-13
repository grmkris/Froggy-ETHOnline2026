/**
 * Home's first screen: the landing's voice, now in the person's own room.
 * The heading text is the one six browser specs find Home by; the mark
 * around one word is presentation, not a change to the name.
 */

import { Link } from "@tanstack/react-router";
import { CoinsIcon, PlaneIcon, ShoppingBagIcon } from "lucide-react";
import type { ReactElement } from "react";

import { stickerForHome } from "../../lib/frog-pose";
import { InboxNudge } from "../chat/inbox-nudge";

const Sticker = ({ needsUser }: { readonly needsUser: number }) => {
  const [first, second] = stickerForHome(needsUser);
  return (
    <span className="playground-sticker" data-needs-user={needsUser}>
      {first.toUpperCase()}
      <br />
      {second.toUpperCase()}
    </span>
  );
};

export const EmptyState = ({
  disabled,
  needsUser,
  onSend,
}: {
  readonly disabled: boolean;
  /** Approvals and purchases waiting, the figure the rail badge shows. */
  readonly needsUser: number;
  readonly onSend: (text: string) => void;
}): ReactElement => (
  <section
    aria-label="Use Froggy here"
    className="home-hero"
    data-slot="home-intro"
  >
    <div>
      <p className="playground-eyebrow">Small frog. Big plans.</p>
      <h1 className="home-headline">
        What can I <span className="playground-mark">help</span> with?
      </h1>
      <p className="home-subtitle">
        A little research. A trip to plan. Something worth finding.
      </p>
      <div className="home-actions">
        <Link
          className="playground-chip"
          search={{ track: true }}
          to="/watchlist"
        >
          <CoinsIcon aria-hidden />
          Track a token
        </Link>
        <button
          className="playground-chip"
          disabled={disabled}
          type="button"
          onClick={() => {
            onSend(
              "Help me plan a trip. Ask where I want to go, my dates and budget first."
            );
          }}
        >
          <PlaneIcon aria-hidden />
          Plan a trip
        </button>
        <button
          className="playground-chip"
          disabled={disabled}
          type="button"
          onClick={() => {
            onSend(
              "Help me find something worth buying. Ask what I have in mind and my budget first."
            );
          }}
        >
          <ShoppingBagIcon aria-hidden />
          Find something good
        </button>
      </div>
      <InboxNudge />
    </div>
    <div className="home-art">
      <img
        alt=""
        height={640}
        sizes="(max-width: 1023px) 120px, 300px"
        src="/froggy/next-idea.webp"
        srcSet="/froggy/next-idea-320.webp 320w, /froggy/next-idea.webp 640w"
        width={640}
      />
      <Sticker needsUser={needsUser} />
    </div>
  </section>
);
