/**
 * The few things worth a slash.
 *
 * Not a command language: two verbs a person reaches for while the agent
 * has the floor. Stop acts at once, on the run; status is an ask, sent as a
 * turn in plain words.
 */

export type SlashCommand =
  | { readonly kind: "status" }
  | { readonly kind: "stop" }
  | {
      readonly kind: "unknown";
      readonly name: string;
      readonly reason: string;
    };

export interface SlashEntry {
  readonly hint: string;
  readonly name: "status" | "stop";
  readonly usage: string;
}

const SLASH_COMMANDS: readonly SlashEntry[] = [
  {
    hint: "Stop the running turn, here and on the server.",
    name: "stop",
    usage: "/stop",
  },
  {
    hint: "Ask for the wallet and the rules.",
    name: "status",
    usage: "/status",
  },
];

/** The commands whose name starts with what has been typed so far. */
export const slashMatches = (draft: string): readonly SlashEntry[] => {
  if (!draft.startsWith("/")) {
    return [];
  }
  const typed = draft.slice(1).split(/\s+/u)[0]?.toLowerCase() ?? "";
  return SLASH_COMMANDS.filter((entry) => entry.name.startsWith(typed));
};

/** Null when the text is not a command at all: it is a message. */
export const parseSlash = (text: string): SlashCommand | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [rawName = ""] = trimmed.slice(1).split(/\s+/u);
  const name = rawName.toLowerCase();
  if (name === "stop" || name === "status") {
    return { kind: name };
  }
  return { kind: "unknown", name, reason: "no such command" };
};

/** What /status asks, in the conversation, so Home and chat send the same turn. */
export const STATUS_PROMPT = "What is the state of the wallet and the mandate?";

/**
 * Run a recognised slash command. Home and chat share this so a verb typed
 * on either surface does the same thing; unknown names are left to the
 * composer’s own hint.
 */
export const applySlash = (
  command: SlashCommand,
  actions: {
    readonly send: (text: string) => void;
    readonly stop: () => void;
  }
): void => {
  if (command.kind === "stop") {
    actions.stop();
    return;
  }
  if (command.kind === "status") {
    actions.send(STATUS_PROMPT);
  }
};
