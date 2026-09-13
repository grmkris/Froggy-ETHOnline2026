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
import { Link, useLocation } from "@tanstack/react-router";
import { EllipsisIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useMediaQuery } from "../hooks/use-media-query";
import { useOnline } from "../hooks/use-online";
import { useChatSurface } from "../lib/chat-context";
import { connectionKind, connectionWords } from "../lib/connection";
import { SECONDARY_ITEMS } from "../lib/nav";
import { useIdentity } from "../lib/privy";
import { scrollToLive } from "../lib/scroll-to-live";
import { stubsOf } from "../lib/stubs";
import { useWorkspace } from "../lib/workspace-context";
import { driveModeOf } from "./browser/live-browser-card";
import { ChatToolbar } from "./chat/chat-toolbar";
import {
  RecentConversations,
  ConversationActions,
} from "./chat/recent-conversations";
import { StopFeedback } from "./stop-feedback";

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

const WorkspaceRunStatus = () => {
  const surface = useChatSurface();
  const { app, pendingPurchases } = useWorkspace();
  const waiting = app.approvals.length + pendingPurchases;
  return (
    <>
      {" "}
      {surface.busy || waiting > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-sm sm:px-6">
          <span aria-live="polite">
            {waiting > 0
              ? `${waiting} approval${waiting === 1 ? "" : "s"} waiting`
              : "Froggy is working…"}
          </span>
          <Link
            to="/chat/$conversationId"
            params={{ conversationId: surface.conversationId }}
            className="text-brand ml-auto inline-flex min-h-11 items-center font-medium"
          >
            Return to chat
          </Link>
          {surface.busy ? (
            <Button
              variant="outline"
              onClick={() => {
                surface.stopRun.stop();
              }}
            >
              Stop the run
            </Button>
          ) : null}
        </div>
      ) : null}
      {surface.stopRun.state === "idle" ? null : (
        <div className="px-4 py-2">
          <StopFeedback
            state={surface.stopRun.state}
            onRetry={() => {
              surface.stopRun.stop();
            }}
            onDismiss={() => {
              surface.stopRun.clear();
            }}
          />
        </div>
      )}
    </>
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
  const path = useLocation({ select: (location) => location.pathname });
  const surface = useChatSurface();
  const chatPage = path === "/" || path.startsWith("/chat");
  const roomy = useMediaQuery("(min-width: 1280px)");
  const title = chatPage
    ? (surface.conversation?.title ?? "Home")
    : ([
        ...SECONDARY_ITEMS,
        { to: "/inbox", label: "Inbox" },
        { to: "/watchlist", label: "Watchlist" },
        { to: "/services", label: "Tools" },
      ].find((item) => path.startsWith(item.to))?.label ?? "Froggy");
  return (
    <header className="workspace-toolbar relative z-20 shrink-0 border-b">
      <div className="flex min-h-14 items-center gap-2 px-4 sm:px-6">
        {wide ? null : <FrogMark className="size-6 shrink-0" compact />}
        <div className="min-w-0 flex-1">
          {chatPage && surface.conversation ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    className="max-w-full justify-start px-0"
                    aria-label="Conversation actions"
                  />
                }
              >
                <span className="truncate">{title}</span>
                <ChevronDownIcon data-icon="inline-end" />
              </PopoverTrigger>
              <PopoverContent align="start">
                <p className="text-muted-foreground mb-3 text-xs">
                  {surface.conversation.source} ·{" "}
                  {new Date(
                    surface.conversation.updatedAt
                  ).toLocaleDateString()}
                </p>
                <ConversationActions conversation={surface.conversation} />
                <Link
                  to="/activity"
                  className="mt-2 flex min-h-11 items-center text-sm"
                >
                  View activity
                </Link>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="truncate text-sm font-semibold">{title}</span>
          )}
        </div>
        {chatPage ? (
          <ChatToolbar
            drive={driveModeOf(surface.browser.state)}
            watchlistOpen={
              surface.watchlistOpen && surface.popOut.mode !== "split"
            }
            onToggleWatchlist={
              roomy
                ? () => {
                    if (surface.popOut.mode === "split") {
                      surface.popOut.handleDock();
                    }
                    surface.setWatchlistOpen(!surface.watchlistOpen);
                  }
                : undefined
            }
            onShowBrowser={() => {
              surface.showBrowser();
              scrollToLive();
            }}
          />
        ) : null}
        {wide ? null : <RecentConversations compact />}
        <WorkspaceMenu />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 empty:hidden sm:px-6">
        <Flags
          authenticated={identity.authenticated}
          connected={connected}
          online={online}
          ready={identity.ready}
          stubbed={identity.stubbed}
          stubs={stubs}
        />
      </div>
      {chatPage ? null : <WorkspaceRunStatus />}
    </header>
  );
};
