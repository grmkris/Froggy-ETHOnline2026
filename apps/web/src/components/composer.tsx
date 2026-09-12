/**
 * Where you ask.
 *
 * Enter sends, Shift+Enter breaks a line. While a turn is running the button
 * becomes Stop, and stopping is two things: the local detach and the server
 * abort, because the run belongs to the server and would otherwise keep
 * spending with nobody watching. Enter while a turn runs queues one message
 * for the moment the turn ends; a slash opens the two commands.
 */

import { Button } from "@froggy/ui/components/button";
import { Kbd, KbdGroup } from "@froggy/ui/components/kbd";
import { Textarea } from "@froggy/ui/components/textarea";
import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { sendsOnKey } from "../lib/keymap";
import { parseSlash, slashMatches } from "../lib/slash";
import type { SlashCommand } from "../lib/slash";

interface ComposerProps {
  /** An approval card is open above: the turn is waiting on the person. */
  readonly asking: boolean;
  readonly busy: boolean;
  readonly disabledReason: string | null;
  readonly onCommand: (command: SlashCommand) => void;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
  /** What the empty box says while nothing is happening; the default names the slash. */
  readonly placeholder?: string | undefined;
  /** Things worth asking next, as chips. Empty when there is nothing to say. */
  readonly suggestions: readonly string[];
}

/** What the empty box says, by what the turn is doing. */
const placeholderFor = (
  disabledReason: string | null,
  asking: boolean,
  busy: boolean,
  idle: string
): string => {
  if (disabledReason !== null) {
    return disabledReason;
  }
  if (asking) {
    return "Waiting for your answer above";
  }
  return busy ? "Froggy is working… Enter queues your next message" : idle;
};

export const Composer = ({
  asking,
  busy,
  disabledReason,
  onCommand,
  onSend,
  onStop,
  placeholder = "Ask Froggy to do something, or type / for commands…",
  suggestions,
}: ComposerProps): React.ReactElement => {
  const [draft, setDraft] = useState("");
  /** One message held for the moment the running turn ends. */
  const [queued, setQueued] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const disabled = disabledReason !== null;
  const commands = slashMatches(draft);
  const reasonId = useId();
  const messageId = "composer-message";

  // The queued message goes when the turn ends; if the composer has been
  // locked meanwhile — a lost socket — it goes back to the draft
  // rather than into a wallet that is no longer taking requests.
  useEffect(() => {
    const timer =
      busy || queued === null
        ? null
        : setTimeout(() => {
            setQueued(null);
            if (disabled) {
              setDraft(queued);
            } else {
              onSend(queued);
            }
          }, 0);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [busy, disabled, onSend, queued]);

  const submit = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed === "" || disabled) {
      return;
    }
    const command = parseSlash(trimmed);
    if (command !== null) {
      if (command.kind === "unknown") {
        setHint(`/${command.name}: ${command.reason}`);
        return;
      }
      onCommand(command);
      setDraft("");
      setHint(null);
      return;
    }
    if (busy) {
      setQueued(trimmed);
    } else {
      onSend(trimmed);
    }
    setDraft("");
    setHint(null);
  };

  return (
    <div className="space-y-2" data-slot="composer">
      {suggestions.length > 0 && !disabled ? (
        <div className="no-scrollbar scroll-fade-x flex flex-nowrap gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible">
          {suggestions.map((suggestion) => (
            <button
              className="bg-card shadow-card hover:bg-accent shrink-0 rounded-full px-3 py-1.5 text-left text-xs whitespace-nowrap transition-colors"
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
      {queued === null ? null : (
        <div className="bg-brand-soft/60 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs">
          <span className="text-muted-foreground shrink-0">Next</span>
          <span className="min-w-0 flex-1 truncate">{queued}</span>
          <Button
            aria-label="Cancel the queued message"
            onClick={() => {
              setDraft(queued);
              setQueued(null);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      )}
      {commands.length > 0 && !disabled ? (
        <ul className="bg-card shadow-card divide-y rounded-xl text-sm">
          {commands.map((entry) => (
            <li key={entry.name}>
              <button
                className="hover:bg-accent flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors"
                onClick={() => {
                  setDraft(`/${entry.name}`);
                }}
                type="button"
              >
                <span className="font-mono text-xs">{entry.usage}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hint === null ? null : (
        <p className="text-refused px-2 text-xs">{hint}</p>
      )}
      {disabledReason === null ? null : (
        <p className="text-muted-foreground px-2 text-xs" id={reasonId}>
          {disabledReason}
        </p>
      )}
      <form
        className="bg-card shadow-card focus-within:ring-ring/40 flex items-end gap-2 rounded-2xl p-2 focus-within:ring-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          aria-describedby={disabledReason === null ? undefined : reasonId}
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
          disabled={disabled}
          id={messageId}
          onChange={(event) => {
            setDraft(event.target.value);
            setHint(null);
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
          placeholder={placeholderFor(
            disabledReason,
            asking,
            busy,
            placeholder
          )}
          rows={1}
          value={draft}
        />
        {busy ? (
          <Button
            aria-label="Stop the run"
            className="size-11"
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
            className="size-11"
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
        <span aria-hidden>·</span>
        <KbdGroup>
          <Kbd>/</Kbd>
        </KbdGroup>
        commands
      </p>
    </div>
  );
};
