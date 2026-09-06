/**
 * The few things worth a slash.
 *
 * Not a command language: three verbs a person reaches for while the agent
 * has the floor. Stop acts at once, on the run; status and top-up are asks,
 * sent as a turn in plain words.
 */

export type SlashCommand =
  | { readonly kind: "status" }
  | { readonly kind: "stop" }
  | { readonly amountUsd: number; readonly kind: "topup" }
  | {
      readonly kind: "unknown";
      readonly name: string;
      readonly reason: string;
    };

export interface SlashEntry {
  readonly hint: string;
  readonly name: "status" | "stop" | "topup";
  readonly usage: string;
}

const SLASH_COMMANDS: readonly SlashEntry[] = [
  {
    hint: "Stop the running turn, here and on the server.",
    name: "stop",
    usage: "/stop",
  },
  {
    hint: "Ask for the wallet and the mandate.",
    name: "status",
    usage: "/status",
  },
  {
    hint: "Top up the pocket with that many USDC.",
    name: "topup",
    usage: "/topup 1",
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
  const [rawName = "", argument] = trimmed.slice(1).split(/\s+/u);
  const name = rawName.toLowerCase();
  if (name === "stop" || name === "status") {
    return { kind: name };
  }
  if (name === "topup") {
    const amountUsd = Number(argument);
    return argument !== undefined && Number.isFinite(amountUsd) && amountUsd > 0
      ? { amountUsd, kind: "topup" }
      : { kind: "unknown", name, reason: "needs an amount, like /topup 1" };
  }
  return { kind: "unknown", name, reason: "no such command" };
};
