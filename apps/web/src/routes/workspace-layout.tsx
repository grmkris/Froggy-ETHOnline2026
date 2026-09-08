/**
 * The workspace: everything that must outlive a page change.
 *
 * The sockets, the conversation, the painter and the pop-out live here and
 * are handed down through two contexts. The pages are the routes beneath;
 * a person can leave the chat mid-turn for their wallet and come back to a
 * turn that never stopped.
 */

import { useChat } from "@ai-sdk/react";
import { Outlet } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo } from "react";
import type { ReactElement } from "react";

import { Announcer } from "../components/announcer";
import { useSplitWidth } from "../components/browser/browser-split-pane";
import { AppFrame } from "../components/nav/app-frame";
import { useStopRun } from "../components/stop-feedback";
import { useAppSocket } from "../hooks/use-app-socket";
import { useBrowserSocket } from "../hooks/use-browser-socket";
import { useMediaQuery } from "../hooks/use-media-query";
import { usePopOut } from "../hooks/use-pop-out";
import { useReceipts } from "../hooks/use-receipts";
import { useWebMcp } from "../hooks/use-webmcp";
import type { Notice } from "../lib/app-state";
import { createBrowserPainter } from "../lib/browser-painter";
import { ChatContext } from "../lib/chat-context";
import type { ChatSurface } from "../lib/chat-context";
import { CHAT_ERROR_ID, chatErrorText } from "../lib/chat-error";
import { SessionIdsContext } from "../lib/session-ids";
import { useSessionToken } from "../lib/session-token";
import type { FroggyMessage } from "../lib/stream-model";
import { WorkspaceContext } from "../lib/workspace-context";
import type { Workspace } from "../lib/workspace-context";

export const WorkspaceLayout = (): ReactElement => {
  const painter = useMemo(() => createBrowserPainter(), []);
  useEffect(
    () => () => {
      painter.dispose();
    },
    [painter]
  );

  const popOut = usePopOut();
  const phone = useMediaQuery("(max-width: 767px)");
  const split = useSplitWidth();
  const app = useAppSocket();
  // While a window holds the page this tab has no screencast of its own.
  const browser = useBrowserSocket(painter, popOut.mode !== "window");
  const { getToken } = useSessionToken();
  useReceipts(app.sessionId, app.dispatch);

  // `headers` is resolved per request rather than captured once, so a turn
  // started an hour into a session sends the refreshed token instead of the
  // one that happened to be current when this component mounted.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<FroggyMessage>({
        api: "/api/chat",
        headers: async () => {
          const token = await getToken();
          return token === null ? {} : { authorization: `Bearer ${token}` };
        },
      }),
    [getToken]
  );
  const chat = useChat<FroggyMessage>({ resume: true, transport });
  const stopRun = useStopRun(chat.stop);
  const busy = chat.status === "streaming" || chat.status === "submitted";
  // A refused turn — the day's model budget spent, a malformed request — comes
  // back as the request's error, not as a message. It is shown beside the
  // socket's notices so a refusal never reads as a turn that silently did
  // nothing, and dismissing it clears the error the transport recorded.
  const chatNotices = useMemo(
    (): readonly Notice[] =>
      chat.error === undefined
        ? []
        : [
            {
              // Not ordered against the socket's notices; it is shown first.
              at: 0,
              id: CHAT_ERROR_ID,
              text: chatErrorText(chat.error.message),
              tone: "error",
            },
          ],
    [chat.error]
  );
  const { clear: clearStop } = stopRun;
  const { sendMessage } = chat;
  const send = useCallback(
    (text: string): void => {
      clearStop();
      void sendMessage({ metadata: { at: Date.now() }, text });
    },
    [clearStop, sendMessage]
  );

  // The wallet as tools for this browser's own agent, through the same leash.
  const webMcp = useWebMcp({
    mandate: app.mandate,
    receipts: app.receipts,
    send,
    wallet: app.wallet,
  });

  const deleteMyData = useCallback(async (): Promise<void> => {
    const token = await getToken();
    const response = await fetch("/api/me", {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`delete account: ${response.status}`);
    }
    globalThis.location.reload();
  }, [getToken]);

  const sessionIds = useMemo(
    () => ({
      agentSignerId: app.agentSignerId,
      hcsTopicId: app.hcsTopicId,
      policyId: app.policyId,
    }),
    [app.agentSignerId, app.hcsTopicId, app.policyId]
  );
  const workspace = useMemo(
    (): Workspace => ({ app, deleteMyData, webMcp }),
    [app, deleteMyData, webMcp]
  );
  const surface = useMemo(
    (): ChatSurface => ({
      browser,
      busy,
      chat,
      chatNotices,
      painter,
      phone,
      popOut,
      send,
      split,
      stopRun,
    }),
    [
      browser,
      busy,
      chat,
      chatNotices,
      painter,
      phone,
      popOut,
      send,
      split,
      stopRun,
    ]
  );

  return (
    <SessionIdsContext.Provider value={sessionIds}>
      <WorkspaceContext.Provider value={workspace}>
        <ChatContext.Provider value={surface}>
          <Announcer
            approvals={app.approvals}
            mandate={app.mandate}
            receipts={app.receipts}
          />
          <AppFrame
            connected={app.connected}
            modes={app.modes}
            waiting={app.approvals.length}
          >
            <Outlet />
          </AppFrame>
        </ChatContext.Provider>
      </WorkspaceContext.Provider>
    </SessionIdsContext.Provider>
  );
};
