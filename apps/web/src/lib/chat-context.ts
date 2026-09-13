/**
 * The conversation and the page it drives, kept alive across navigation.
 *
 * The chat, the browser socket, the painter and the pop-out state live in
 * the layout; the chat page reads them here and unmounts freely. A turn that
 * is streaming while the person looks at their wallet keeps streaming, and
 * is all there when they come back.
 */

import type { WatchlistItem } from "@froggy/domain";
import { createContext, useContext } from "react";

import type { SplitWidth } from "../components/browser/browser-split-pane";
import type { useStopRun } from "../components/stop-feedback";
import type { BrowserStream } from "../hooks/use-browser-socket";
import type { usePersistentChat } from "../hooks/use-persistent-chat";
import type { PopOut } from "../hooks/use-pop-out";
import type { Notice } from "./app-state";
import type { BrowserPainter } from "./browser-painter";

export interface ChatSurface extends ReturnType<typeof usePersistentChat> {
  readonly watchlistOpen: boolean;
  readonly setWatchlistOpen: (open: boolean) => void;
  readonly attachedItem: WatchlistItem | null;
  readonly attachItem: (item: WatchlistItem | null) => void;
  readonly browser: BrowserStream;
  readonly browserRequested: boolean;
  readonly showBrowser: () => void;
  readonly hideBrowser: () => void;
  readonly busy: boolean;
  /** A refused turn, shown beside the socket's notices. */
  readonly chatNotices: readonly Notice[];
  readonly painter: BrowserPainter;
  readonly phone: boolean;
  readonly popOut: PopOut;
  readonly send: (text: string, includeOtherThreads?: boolean) => void;
  readonly split: SplitWidth;
  readonly stopRun: ReturnType<typeof useStopRun>;
}

export const ChatContext = createContext<ChatSurface | null>(null);

export const useChatSurface = (): ChatSurface => {
  const surface = useContext(ChatContext);
  if (surface === null) {
    throw new Error("useChatSurface is only available inside the workspace");
  }
  return surface;
};
