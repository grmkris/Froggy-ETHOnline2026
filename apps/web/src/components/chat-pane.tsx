/**
 * The chat pane.
 *
 * `resume: true` and a server-side stop are a pair. The run belongs to the
 * server, so reloading this tab must reattach to a turn that never stopped —
 * and stopping must be an explicit request, because the local `stop()` only
 * detaches this client from a run that would otherwise keep spending.
 */

import { useChat } from "@ai-sdk/react";
import { Button } from "@froggy/ui/components/button";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const SUGGESTIONS = [
  "What's the cheapest USDC borrow right now?",
  "Buy the packed lending snapshot and show me what it says.",
  "Send 5 USDC to 0xdead0000000000000000000000000000deadbeef",
] as const;

export const ChatPane = (): React.ReactElement => {
  const [draft, setDraft] = useState("");
  const { messages, sendMessage, status, stop } = useChat({
    resume: true,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const busy = status === "streaming" || status === "submitted";

  const submit = (text: string): void => {
    if (text.trim() === "" || busy) {
      return;
    }
    void sendMessage({ text });
    setDraft("");
  };

  const abort = (): void => {
    // Both halves. The local `stop()` alone detaches this client and leaves the
    // server-owned run happily continuing to spend.
    void fetch("/api/chat/stop", { method: "POST" });
    void stop();
  };

  return (
    <section className="flex min-h-0 w-full flex-col gap-3 lg:w-96">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-white/60">
              Ask for something that costs money. The mandate decides whether it
              happens.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                className="block w-full rounded-md bg-white/[0.03] p-2 text-left text-xs text-white/70 ring-1 ring-white/10 hover:bg-white/[0.06]"
                key={suggestion}
                onClick={() => {
                  submit(suggestion);
                }}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <article
            className={`rounded-lg p-3 text-sm ring-1 ${
              message.role === "user"
                ? "bg-white/[0.06] ring-white/10"
                : "bg-black/30 ring-white/5"
            }`}
            key={message.id}
          >
            {message.parts.map((part, index) => {
              if (part.type === "text") {
                return (
                  <p
                    className="whitespace-pre-wrap"
                    key={`${message.id}-${index}`}
                  >
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith("tool-")) {
                return (
                  <p
                    className="font-mono text-[11px] text-white/40"
                    key={`${message.id}-${index}`}
                  >
                    · {part.type.replace("tool-", "")}
                  </p>
                );
              }
              return null;
            })}
          </article>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <textarea
          aria-label="Message"
          className="min-h-[42px] flex-1 resize-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/30"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask Froggy to do something…"
          rows={1}
          value={draft}
        />
        {busy ? (
          <Button onClick={abort} type="button" variant="outline">
            Stop
          </Button>
        ) : (
          <Button type="submit">Send</Button>
        )}
      </form>
    </section>
  );
};
