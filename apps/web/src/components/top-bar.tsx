/** The workspace identity and connection status, above the content at every width. */

import type { ServiceModes } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@froggy/ui/components/popover";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useMediaQuery } from "../hooks/use-media-query";
import { useOnline } from "../hooks/use-online";
import { connectionKind, connectionWords } from "../lib/connection";
import { SECONDARY_ITEMS } from "../lib/nav";
import { useIdentity } from "../lib/privy";
import { stubsOf } from "../lib/stubs";
import { RecentConversations } from "./chat/recent-conversations";

/** Offline, a down server, signed out, a local identity, how much is stubbed. */
const Flags = ({
  authenticated,
  connected,
  online,
  ready,
  stubbed,
  stubs,
}: {
  readonly authenticated: boolean;
  readonly connected: boolean;
  readonly online: boolean;
  readonly ready: boolean;
  readonly stubbed: boolean;
  readonly stubs: readonly string[];
}): ReactElement => {
  const status = connectionWords(
    connectionKind({ authenticated, connected, online, ready })
  );
  return (
    <>
      {status === null ? null : (
        <Badge className="text-[10px]" variant="secondary">
          {status}
        </Badge>
      )}
      {stubbed ? (
        <Badge
          className="border-drive-agent text-[10px] uppercase"
          variant="outline"
        >
          local identity
        </Badge>
      ) : null}
      {stubs.length > 0 ? (
        <Badge
          className="border-drive-agent/60 text-drive-agent-foreground max-w-[min(100%,20rem)] shrink text-[10px] text-wrap whitespace-normal"
          variant="outline"
          title={stubs.join(", ")}
        >
          {stubs.length} stub{stubs.length === 1 ? "" : "s"}
        </Badge>
      ) : null}
    </>
  );
};

const WorkspaceMenu = (): ReactElement => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button aria-label="Workspace menu" size="icon" variant="ghost" />
        }
      >
        <EllipsisIcon />
      </PopoverTrigger>
      <PopoverContent align="end">
        {SECONDARY_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => {
                setOpen(false);
              }}
              className="hover:bg-accent focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none focus-visible:ring-2"
            >
              <Icon aria-hidden className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

export const TopBar = ({
  connected,
  modes,
}: {
  readonly connected: boolean;
  readonly modes: ServiceModes | null;
}): ReactElement | null => {
  const identity = useIdentity();
  const online = useOnline();
  const stubs = stubsOf(modes);
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <header className="bg-background sticky top-0 z-20 border-b">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
        {/*
          The rail carries the wordmark from 768px up. Not rendered rather than
          hidden: a display:none copy is still a second wordmark to anything
          that reads the document instead of looking at it.
        */}
        {wide ? null : (
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft grid size-8 place-items-center rounded-lg">
              <FrogMark className="size-6" compact />
            </span>
            <span className="font-display font-semibold">Froggy</span>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1">
          {wide ? null : <RecentConversations compact />}
          <Flags
            authenticated={identity.authenticated}
            connected={connected}
            online={online}
            ready={identity.ready}
            stubbed={identity.stubbed}
            stubs={stubs}
          />
          {/*
            The rail holds these from 768px up. Below that the pill carries
            three destinations and nothing else, so without them here the
            secondary places would be unreachable on a phone.
          */}
          <WorkspaceMenu />
        </div>
      </div>
    </header>
  );
};
