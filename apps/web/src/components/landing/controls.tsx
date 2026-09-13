import { Button } from "@froggy/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRightIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

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
