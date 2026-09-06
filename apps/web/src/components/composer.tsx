/**
 * Where you ask.
 *
 * Enter sends, Shift+Enter breaks a line. While a turn is running the button
 * becomes Stop, and stopping is two things: the local detach and the server
 * abort, because the run belongs to the server and would otherwise keep
 * spending with nobody watching.
 */

import { Button } from "@froggy/ui/components/button";
import { Kbd, KbdGroup } from "@froggy/ui/components/kbd";
import { Textarea } from "@froggy/ui/components/textarea";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useState } from "react";

import { sendsOnKey } from "../lib/keymap";

interface ComposerProps {
  /** An approval card is open above: the turn is waiting on the person. */
  readonly asking: boolean;
  readonly busy: boolean;
  readonly disabledReason: string | null;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
  /** Things worth asking next, as chips. Empty when there is nothing to say. */
  readonly suggestions: readonly string[];
}

/** What the empty box says, by what the turn is doing. */
const placeholderFor = (
  disabledReason: string | null,
  asking: boolean,
  busy: boolean
): string => {
  if (disabledReason !== null) {
    return disabledReason;
  }
  if (asking) {
    return "Waiting for your answer above";
  }
  return busy
    ? "Froggy is working… Stop to interrupt"
    : "Ask Froggy to do something…";
};

export const Composer = ({
  asking,
  busy,
  disabledReason,
  onSend,
  onStop,
  suggestions,
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
      {suggestions.length > 0 && !disabled ? (
        <div className="no-scrollbar scroll-fade-x flex flex-nowrap gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible">
          {suggestions.map((suggestion) => (
            <button
              className="bg-card shadow-card hover:bg-accent shrink-0 rounded-full border px-3 py-1.5 text-left text-xs whitespace-nowrap transition-colors"
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
            if (
              sendsOnKey({
                isComposing: event.nativeEvent.isComposing,
                key: event.key,
                shiftKey: event.shiftKey,
              })
            ) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder={placeholderFor(disabledReason, asking, busy)}
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
      {/* Hidden on a phone, where there is no Enter to speak of. */}
      <p className="text-muted-foreground hidden items-center gap-1.5 px-2 text-[11px] sm:flex">
        <KbdGroup>
          <Kbd>Enter</Kbd>
        </KbdGroup>
        send
        <span aria-hidden>·</span>
        <KbdGroup>
          <Kbd>Shift</Kbd>
          <Kbd>Enter</Kbd>
        </KbdGroup>
        new line
      </p>
    </div>
  );
};
