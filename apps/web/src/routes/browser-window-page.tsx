/**
 * The page in its own window.
 *
 * Nothing but the card, as big as the window. It claims the page over the
 * broadcast channel on load and releases it when it goes, so the tab that
 * opened it drops its own screencast for the duration.
 */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { useEffect, useMemo } from "react";
import type { ReactElement } from "react";

import {
  driveModeOf,
  LiveBrowserCard,
} from "../components/browser/live-browser-card";
import { useBrowserSocket } from "../hooks/use-browser-socket";
import { createBrowserPainter } from "../lib/browser-painter";
import { pageWindowLink } from "../lib/page-window";

export const BrowserWindowPage = (): ReactElement => {
  const painter = useMemo(() => createBrowserPainter(), []);
  const browser = useBrowserSocket(painter);

  useEffect(() => {
    const link = pageWindowLink();
    link.post("claim");
    const unsubscribe = link.subscribe((signal) => {
      if (signal === "ask") {
        link.post("claim");
      }
    });
    const release = (): void => {
      link.post("release");
    };
    globalThis.addEventListener("pagehide", release);
    return () => {
      release();
      globalThis.removeEventListener("pagehide", release);
      unsubscribe();
      link.close();
      painter.dispose();
    };
  }, [painter]);

  const drive = driveModeOf(browser.state);
  return (
    <div className="flex h-dvh flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="bg-primary shadow-card grid size-7 place-items-center rounded-lg">
          <FrogMark className="size-5" compact />
        </span>
        <span className="font-display text-sm font-semibold">
          Froggy · the page
        </span>
        <Button
          className="ml-auto"
          onClick={() => {
            globalThis.close();
          }}
          size="sm"
          variant="outline"
        >
          Back to the workspace
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <LiveBrowserCard
          connected={browser.connected}
          drive={drive}
          fill
          interactive
          painter={painter}
          send={browser.send}
          state={browser.state}
        />
      </div>
    </div>
  );
};
