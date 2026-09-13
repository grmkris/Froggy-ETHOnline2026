import { Button } from "@froggy/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { landingAsset } from "../../lib/landing";
import type { LandingVariant } from "../../lib/landing";
import { useIdentity } from "../../lib/privy";

/** A completed sign-in redirects only when the visitor started it here. */
export const LandingSignIn = ({
  compact = false,
}: {
  readonly compact?: boolean;
}) => {
  const identity = useIdentity();
  const navigate = useNavigate();
  const startedHere = useRef(false);
  const admitted = identity.status === "local" || identity.authenticated;
  useEffect(() => {
    if (
      startedHere.current &&
      identity.status === "ready" &&
      identity.authenticated
    ) {
      startedHere.current = false;
      void navigate({ to: "/" });
    }
  }, [identity.authenticated, identity.status, navigate]);
  if (identity.status === "failed") {
    return (
      <div className="landing-auth-error">
        <span role="alert">Sign-in couldn’t start.</span>
        <Button
          onClick={() => {
            window.location.reload();
          }}
          variant="outline"
        >
          Retry sign-in
        </Button>
      </div>
    );
  }
  const loading = identity.status === "loading" || !identity.ready;
  let label = "Sign in";
  if (admitted) {
    label = "Open workspace";
  }
  if (loading) {
    label = "Preparing sign-in";
  }
  return (
    <div className="landing-sign-in">
      <Button
        className={compact ? "landing-cta landing-cta-compact" : "landing-cta"}
        disabled={loading}
        size="lg"
        onClick={() => {
          if (admitted) {
            void navigate({ to: "/" });
          } else {
            startedHere.current = true;
            identity.login();
          }
        }}
      >
        {label}
        {loading ? (
          <LoaderCircleIcon data-icon="inline-end" className="animate-spin" />
        ) : (
          <ArrowUpRightIcon data-icon="inline-end" />
        )}
      </Button>
      {!compact && identity.stubbed ? (
        <span className="landing-local">
          Local identity · development preview
        </span>
      ) : null}
    </div>
  );
};

/** Playback starts on intent, including in reduced-motion and data-saving modes. */
export const LandingPromo = ({
  variant,
}: {
  readonly variant: LandingVariant;
}) => {
  const video = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const play = useCallback(async () => {
    try {
      await video.current?.play();
    } catch {
      // Interrupted or blocked playback stays paused and can be retried.
      video.current?.pause();
    }
  }, []);
  useEffect(() => {
    if (loaded) {
      void play();
    }
  }, [loaded, play]);
  useEffect(() => {
    const element = video.current;
    if (!element) {
      return () => {
        /* No observer was created before the video mounted. */
      };
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) {
          element.pause();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  let label = "Watch Froggy";
  let accessibleLabel = "Play promo";
  let Icon = PlayIcon;
  if (ended) {
    label = "Watch again";
    accessibleLabel = "Replay promo";
    Icon = RotateCcwIcon;
  }
  if (playing) {
    label = "Pause";
    accessibleLabel = "Pause promo";
    Icon = PauseIcon;
  }
  return (
    <section
      className="landing-demo landing-container"
      id="watch"
      aria-labelledby="promo-title"
    >
      <div className="landing-section-top">
        <div>
          <p className="landing-eyebrow">MEET YOUR NEW PLUS-ONE</p>
          <h2 id="promo-title">
            Small frog.
            <br />
            Big possibilities.
          </h2>
        </div>
        <p>
          From the first idea to the final receipt.
          <br />
          Here’s Froggy in 20 seconds.
        </p>
      </div>
      <div className="landing-film">
        <video
          ref={video}
          aria-label="Froggy promo: browser, spending controls, inbox, watchlists and connected agents"
          width={1920}
          height={1080}
          muted
          playsInline
          preload="none"
          poster={landingAsset(`${variant}-poster.webp`)}
          src={loaded ? landingAsset(`${variant}-promo.mp4`) : undefined}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onEnded={() => {
            setEnded(true);
          }}
          onError={() => {
            setFailed(true);
          }}
        />
        {loaded ? null : <div className="landing-film-shade" />}
        <div className="landing-film-controls">
          {loaded ? null : (
            <span className="landing-film-label">
              FROGGY, IN ACTION <span>00:20 · SILENT FILM</span>
            </span>
          )}
          <Button
            variant="secondary"
            className="landing-film-button"
            aria-label={accessibleLabel}
            disabled={failed}
            onClick={() => {
              if (!loaded) {
                setLoaded(true);
                return;
              }
              if (playing) {
                video.current?.pause();
              } else {
                void play();
              }
            }}
          >
            <Icon data-icon="inline-start" />
            {label}
          </Button>
        </div>
      </div>
      {failed ? (
        <output>
          The film couldn’t load. You can still explore everything below.
        </output>
      ) : null}
      <p className="landing-caption">
        Real Froggy screens. Demonstration data stays labelled. You stay in
        control.
      </p>
    </section>
  );
};
