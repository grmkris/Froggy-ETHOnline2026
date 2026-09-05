/**
 * Where you ask.
 *
 * Enter sends, Shift+Enter breaks a line. While a turn is running the button
 * becomes Stop, and stopping is two things: the local detach and the server
 * abort, because the run belongs to the server and would otherwise keep
 * spending with nobody watching.
 */

import { Button } from "@froggy/ui/components/button";
import { Textarea } from "@froggy/ui/components/textarea";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useState } from "react";

const SUGGESTIONS = [
  "What's the cheapest USDC borrow right now?",
  "Buy the lending snapshot and tell me what it says.",
  "Send 5 USDC to 0xdead0000000000000000000000000000deadbeef",
] as const;

interface ComposerProps {
  readonly busy: boolean;
  readonly disabledReason: string | null;
  readonly empty: boolean;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
}

export const Composer = ({
  busy,
  disabledReason,
  empty,
  onSend,
  onStop,
}: ComposerProps): React.ReactElement => {
  const [draft, setDraft] = useState("");
  const disabled = disabledReason !== null;

  const submit = (text: string): void => {
    if (text.trim() === "" || busy || disabled) {
      return;
    }
    onSend(text.trim());
    setDraft("");
  };

  return (
    <div className="space-y-2">
      {empty && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              className="bg-card shadow-card hover:bg-accent rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
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
      <form
        className="bg-card shadow-card focus-within:ring-ring/40 flex items-end gap-2 rounded-2xl border p-2 focus-within:ring-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder={disabledReason ?? "Ask Froggy to do something…"}
          rows={1}
          value={draft}
        />
        {busy ? (
          <Button
            aria-label="Stop the run"
            onClick={onStop}
            size="icon"
            type="button"
            variant="outline"
          >
            <SquareIcon />
          </Button>
        ) : (
          <Button
            aria-label="Send"
            disabled={disabled || draft.trim() === ""}
            size="icon"
            type="submit"
          >
            <ArrowUpIcon />
          </Button>
        )}
      </form>
    </div>
  );
};
