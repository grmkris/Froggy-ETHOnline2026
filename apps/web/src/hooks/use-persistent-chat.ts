import { useChat } from "@ai-sdk/react";
import { ConversationId, HistoryPage } from "@froggy/domain";
import type { HistoryMessage, Receipt } from "@froggy/domain";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, validateUIMessages } from "ai";
import { Schema } from "effect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HistoryClient } from "../lib/history-client";
import { useSessionToken } from "../lib/session-token";
import type { FroggyMessage } from "../lib/stream-model";

const routeConversation = (path: string): ConversationId | null => {
  const id = path.startsWith("/chat/") ? path.slice(6) : null;
  return Schema.is(ConversationId)(id) ? id : null;
};
const messagesOf = async (records: readonly HistoryMessage[]) =>
  await validateUIMessages<FroggyMessage>({
    messages: records
      .toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((record) => ({
        id: record.id,
        role: record.role,
        parts: record.parts,
        metadata: {
          at: record.createdAt,
          runId: record.runId ?? undefined,
        },
      })),
  });

export const usePersistentChat = (client: HistoryClient) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { getToken } = useSessionToken();
  const [id, setId] = useState(
    () => routeConversation(pathname) ?? ConversationId.generate()
  );
  const [savedId, setSavedId] = useState(() => routeConversation(pathname));
  const saved = savedId === id;
  const [crossThreadHistory, setCrossThreadHistory] = useState(false);
  const [loading, setLoading] = useState(saved);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [older, setOlder] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [records, setRecords] = useState<readonly HistoryMessage[]>([]);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const hydrated = useRef<string | null>(null);
  // The bare conversation URL upgrades itself to the canonical one. This used
  // to key on "/" because "/" was the conversation; "/" is Home now, and
  // keying on it here dragged every returning person off Home and into their
  // last chat.
  useEffect(() => {
    if (pathname === "/chat" && saved) {
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: id },
        replace: true,
      });
    }
  }, [id, navigate, pathname, saved]);
  const selected = routeConversation(pathname);
  if (selected !== null && selected !== id) {
    setId(selected);
    setSavedId(selected);
    setLoading(true);
    setHistoryError(null);
    setRecords([]);
    setReceipts([]);
    setOlder(null);
  }
  const entry = useMemo(
    () => client.page(`/api/conversations/${id}/messages?limit=50`),
    [client, id]
  );
  useEffect(() => client.retain(entry), [client, entry]);
  const snapshot = useQuery({
    ...entry.options,
    enabled: saved && client.owner !== null,
  });
  const conversation = useQuery({
    ...client.detailOptions(id),
    enabled: saved && client.owner !== null,
  });
  const transport = useMemo(
    () =>
      new DefaultChatTransport<FroggyMessage>({
        api: "/api/chat",
        fetch: Object.assign(async (...args: Parameters<typeof fetch>) => {
          const response = await fetch(...args);
          if (response.ok && response.headers.get("x-conversation-id") === id) {
            setSavedId(id);
          }
          return response;
        }, fetch),
        headers: async () => {
          const token = await getToken();
          return token === null ? {} : { authorization: `Bearer ${token}` };
        },
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            v: 1,
            conversationId: id,
            messages: messages.slice(-1),
          },
        }),
      }),
    [getToken, id]
  );
  const chat = useChat<FroggyMessage>({
    id,
    transport,
    onFinish: () => {
      void client.refresh();
    },
  });
  const { setMessages, resumeStream, sendMessage } = chat;
  const busy = chat.status === "streaming" || chat.status === "submitted";
  useEffect(() => {
    let cancelled = false;
    const cancel = (): void => {
      cancelled = true;
    };
    if (snapshot.data === undefined || busy) {
      return cancel;
    }
    const stamp = `${id}:${snapshot.dataUpdatedAt}`;
    if (hydrated.current === stamp) {
      return cancel;
    }
    const first = hydrated.current?.startsWith(`${id}:`) !== true;
    const restore = async () => {
      try {
        const canonical = snapshot.data.records.filter(
          (record): record is HistoryMessage => record.kind === "message"
        );
        const messages = await messagesOf(canonical);
        if (cancelled) {
          return;
        }
        hydrated.current = stamp;
        setReceipts((current) => [
          ...new Map(
            [...current, ...(snapshot.data.receipts ?? [])].map((receipt) => [
              receipt.id,
              receipt,
            ])
          ).values(),
        ]);
        const oldest = canonical.at(-1)?.createdAt ?? 0;
        setMessages((current) => [
          ...(first
            ? []
            : current.filter(
                (message) => (message.metadata?.at ?? 0) < oldest
              )),
          ...messages,
        ]);
        setRecords((current) => [
          ...(first
            ? []
            : current.filter((message) => message.createdAt < oldest)),
          ...canonical,
        ]);
        if (first) {
          setOlder(snapshot.data.cursor);
        }

        setLoading(false);
        setHistoryError(null);
        client.observeSnapshot(snapshot.data.sequence);
        if (
          first &&
          canonical.some((message) =>
            ["accepted", "running", "waiting"].includes(message.status)
          )
        ) {
          await resumeStream();
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(
            error instanceof Error
              ? error.message
              : "Saved messages could not be opened."
          );
          setLoading(false);
        }
      }
    };
    void restore();
    return cancel;
  }, [
    busy,
    client,
    id,
    resumeStream,
    setMessages,
    snapshot.data,
    snapshot.dataUpdatedAt,
  ]);
  const send = useCallback(
    (text: string, includeOtherThreads = crossThreadHistory): void => {
      if (loading || historyError !== null || snapshot.isError) {
        return;
      }
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: id },
        replace: !saved,
      });
      void sendMessage(
        { metadata: { at: Date.now() }, text },
        { body: { crossThreadHistory: includeOtherThreads } }
      );
    },
    [
      crossThreadHistory,
      historyError,
      id,
      loading,
      navigate,
      saved,
      sendMessage,
      snapshot.isError,
    ]
  );
  const loadOlder = useCallback(async (): Promise<void> => {
    if (older === null || loadingOlder) {
      return;
    }
    setLoadingOlder(true);
    try {
      const response = await client.request(
        `/api/conversations/${id}/messages?limit=50&before=${encodeURIComponent(older)}`
      );
      const page = Schema.decodeUnknownSync(HistoryPage)(await response.json());
      const additions = page.records.filter(
        (record): record is HistoryMessage => record.kind === "message"
      );
      const decoded = await messagesOf(additions);
      setMessages((current) => [
        ...decoded.filter(
          (message) => !current.some((existing) => existing.id === message.id)
        ),
        ...current,
      ]);
      setRecords((current) => [
        ...additions.filter(
          (message) => !current.some((existing) => existing.id === message.id)
        ),
        ...current,
      ]);
      setReceipts((current) => [
        ...new Map(
          [...current, ...(page.receipts ?? [])].map((receipt) => [
            receipt.id,
            receipt,
          ])
        ).values(),
      ]);
      setOlder(page.cursor);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Older messages could not be loaded."
      );
    }
    setLoadingOlder(false);
  }, [client, id, loadingOlder, older, setMessages]);
  const newChat = (): void => {
    setId(ConversationId.generate());
    setSavedId(null);
    setLoading(false);
    setHistoryError(null);
    setRecords([]);
    setReceipts([]);
    setOlder(null);
    hydrated.current = null;
    // "/" is Home now; a new chat belongs in the conversation.
    void navigate({ to: "/chat" });
  };
  return {
    newChat,
    chat,
    send,
    conversationId: id,
    conversation:
      conversation.data?.record.kind === "conversation"
        ? conversation.data.record
        : null,
    historyLoading: loading && !snapshot.isError,
    historyError: historyError ?? snapshot.error?.message ?? null,
    crossThreadHistory,
    setCrossThreadHistory,
    historyRecords: records,
    historyReceipts: receipts,
    loadOlder,
    hasOlder: older !== null,
    loadingOlder,
    retryHistory: () => {
      setHistoryError(null);
      void snapshot.refetch();
    },
  };
};
