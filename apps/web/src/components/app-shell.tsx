/**
 * The frame: the front door, or the workspace.
 *
 * There is no anonymous path. A person without a session sees the gate; a
 * local development identity walks straight through, marked as such in the
 * top bar so nobody mistakes it for a login.
 */

import { Outlet } from "@tanstack/react-router";

import { useIdentity } from "../lib/privy";
import { SignInGate } from "./sign-in-gate";

export const AppShell = (): React.ReactElement => {
  const identity = useIdentity();
  const admitted =
    identity.status === "local" ||
    (identity.status === "ready" && identity.authenticated);
  return admitted ? <Outlet /> : <SignInGate />;
};
