/**
 * The workspace frame.
 *
 * Three panes on a desktop; on a phone the chat is primary and the browser
 * becomes a strip, because on a small screen the thing you need is the
 * conversation and the thing you need to *glance at* is the page.
 */

import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { Outlet } from "@tanstack/react-router";

import { useIdentity } from "../lib/privy";

export const AppShell = (): React.ReactElement => {
  const identity = useIdentity();
  const handleSignIn = (): void => {
    identity.login();
  };
  const handleSignOut = (): void => {
    identity.logout();
  };

  return (
    <div className="flex h-dvh flex-col bg-[#07090c] text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">🐸</span>
          <span className="text-sm font-medium">Froggy</span>
          <span className="hidden text-xs text-white/40 sm:inline">
            a browser you can watch, on a leash you set
          </span>
        </div>
        <div className="flex items-center gap-2">
          {identity.stubbed ? (
            <Badge
              className="border-amber-500/50 text-[10px] text-amber-300 uppercase"
              variant="outline"
            >
              local identity
            </Badge>
          ) : null}
          {identity.authenticated ? (
            <Button onClick={handleSignOut} size="sm" variant="outline">
              Sign out
            </Button>
          ) : (
            <Button
              disabled={identity.stubbed}
              onClick={handleSignIn}
              size="sm"
              title={
                identity.stubbed
                  ? "Set VITE_PRIVY_APP_ID to enable sign-in."
                  : undefined
              }
            >
              Sign in
            </Button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 p-3">
        <Outlet />
      </main>
    </div>
  );
};
