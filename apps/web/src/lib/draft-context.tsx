import type { ConversationId, EmailFileId, EmailId } from "@froggy/domain";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";

import type { AppStream } from "../hooks/use-app-socket";

export interface ChatDraft {
  readonly text: string;
  readonly queued: string | null;
  readonly email: { readonly id: EmailId; readonly subject: string } | null;
}
export interface EmailFields {
  readonly to: string;
  readonly cc: string;
  readonly bcc: string;
  readonly subject: string;
  readonly text: string;
  readonly files: readonly EmailFileId[];
}
const EMPTY_CHAT: ChatDraft = { text: "", queued: null, email: null };
interface DraftStore {
  readonly chats: ReadonlyMap<ConversationId, ChatDraft>;
  readonly emails: ReadonlyMap<string, EmailFields>;
  readonly editChat: (id: ConversationId, update: Partial<ChatDraft>) => void;
  readonly editEmail: (
    id: string,
    initial: EmailFields,
    update: Partial<EmailFields>
  ) => void;
  readonly clearEmail: (id: string) => void;
}
interface DraftMemory {
  readonly owner: AppStream["sessionId"];
  readonly chats: ReadonlyMap<ConversationId, ChatDraft>;
  readonly emails: ReadonlyMap<string, EmailFields>;
}
const DraftContext = createContext<DraftStore | null>(null);

/** Memory belongs to this signed-in workspace, never to a route or localStorage. */
export const DraftProvider = ({
  children,
  sessionId,
}: {
  readonly children: ReactNode;
  readonly sessionId: AppStream["sessionId"];
}) => {
  const [memory, setMemory] = useState<DraftMemory>({
    owner: sessionId,
    chats: new Map(),
    emails: new Map(),
  });
  // Reset before the new session renders without remounting the workspace.
  if (memory.owner !== sessionId) {
    setMemory({ owner: sessionId, chats: new Map(), emails: new Map() });
  }
  const editChat = useCallback(
    (id: ConversationId, update: Partial<ChatDraft>) => {
      setMemory((current) =>
        current.owner === sessionId
          ? {
              ...current,
              chats: new Map(current.chats).set(id, {
                ...EMPTY_CHAT,
                ...current.chats.get(id),
                ...update,
              }),
            }
          : current
      );
    },
    [sessionId]
  );
  const editEmail = useCallback(
    (id: string, initial: EmailFields, update: Partial<EmailFields>) => {
      // An upload finishing for an earlier session cannot restore its fields.
      setMemory((current) =>
        current.owner === sessionId
          ? {
              ...current,
              emails: new Map(current.emails).set(id, {
                ...initial,
                ...current.emails.get(id),
                ...update,
              }),
            }
          : current
      );
    },
    [sessionId]
  );
  const clearEmail = useCallback(
    (id: string) => {
      setMemory((current) => {
        if (current.owner !== sessionId) {
          return current;
        }
        const emails = new Map(current.emails);
        emails.delete(id);
        return { ...current, emails };
      });
    },
    [sessionId]
  );
  const { chats, emails } = memory;
  const value = useMemo(
    () => ({ chats, emails, editChat, editEmail, clearEmail }),
    [chats, emails, editChat, editEmail, clearEmail]
  );
  return (
    <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
  );
};
export const useDrafts = (): DraftStore => {
  const store = useContext(DraftContext);
  if (store === null) {
    throw new Error("Drafts require a workspace");
  }
  return store;
};
export const useConversationDraft = (id: ConversationId) => {
  const { chats, editChat } = useDrafts();
  const update = useCallback(
    (value: Partial<ChatDraft>) => {
      editChat(id, value);
    },
    [editChat, id]
  );
  return { draft: chats.get(id) ?? EMPTY_CHAT, update };
};
