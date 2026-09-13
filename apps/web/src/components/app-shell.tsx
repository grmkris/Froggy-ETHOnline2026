/**
 * The frame: the front door, or the workspace.
 *
 * The landing is public, and it is what a signed-out visitor gets at the root:
 * the product before the password. Every other workspace route still asks for
 * a session, and a local development identity walks straight through, marked
 * as such in the top bar so nobody mistakes it for a login.
 */

import { Outlet, useLocation } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { isLandingPath } from "../lib/landing";
import { useIdentity } from "../lib/privy";
import { SignInGate } from "./sign-in-gate";

/**
 * Lazy for the same reason the landing route is: a signed-in person never
 * renders this, and the page carries the hero art and the promo player.
 */
const Landing = lazy(async () => {
  const module = await import("../routes/landing-page");
  return { default: module.LandingIndexPage };
});

export const AppShell = (): React.ReactElement => {
  const identity = useIdentity();
  const pathname = useLocation({ select: (location) => location.pathname });
  const admitted =
    identity.status === "local" ||
    (identity.status === "ready" && identity.authenticated);
  if (isLandingPath(pathname) || admitted) {
    return <Outlet />;
  }
  // The root is the front door; a deeper URL was asked for on purpose, so it
  // keeps the gate rather than dropping the visitor on a marketing page.
  return pathname === "/" ? (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  ) : (
    <SignInGate />
  );
};
