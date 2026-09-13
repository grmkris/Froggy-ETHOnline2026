/**
 * The frame: the front door, or the workspace.
 *
 * The landing concepts are public. Workspace routes require a session; a
 * local development identity walks straight through, marked as such in the
 * top bar so nobody mistakes it for a login.
 */

import { Outlet, useLocation } from "@tanstack/react-router";

import { isLandingPath } from "../lib/landing";
import { useIdentity } from "../lib/privy";
import { SignInGate } from "./sign-in-gate";

export const AppShell = (): React.ReactElement => {
  const identity = useIdentity();
  const publicPage = useLocation({
    select: (location) => isLandingPath(location.pathname),
  });
  const admitted =
    identity.status === "local" ||
    (identity.status === "ready" && identity.authenticated);
  return publicPage || admitted ? <Outlet /> : <SignInGate />;
};
