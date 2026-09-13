/**
 * The services page's words and rules, kept out of the components so they
 * can be tested without a screen.
 *
 * A task's status is shown in the person's words, not the server's; a
 * simulated result is called that wherever it appears, because the one thing
 * this page must never do is let a fixture pass for a bought answer.
 */

import type { TaskStatus } from "@froggy/domain";
import type { ServiceCard, ServiceName } from "@froggy/protocol";
import {
  AudioLinesIcon,
  ImageIcon,
  MessagesSquareIcon,
  RadioIcon,
  SearchIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StatusTone =
  | "asking"
  | "done"
  | "failed"
  | "settling"
  | "uncertain";

export interface StatusWords {
  readonly label: string;
  readonly tone: StatusTone;
}

/**
 * Tasks retain historical states; neutral execution labels also describe
 * credit-backed work without inventing a wallet settlement.
 */
const STATUS_WORDS: ReadonlyMap<TaskStatus, StatusWords> = new Map([
  ["quoted", { label: "Starting task", tone: "settling" }],
  ["paid", { label: "Provider working", tone: "settling" }],
  ["running", { label: "Working", tone: "settling" }],
  ["paused", { label: "Paused", tone: "uncertain" }],
  ["awaiting_approval", { label: "Waiting for your answer", tone: "asking" }],
  ["done", { label: "Done", tone: "done" }],
  ["failed", { label: "Failed", tone: "failed" }],
  ["cancelled", { label: "Canceled", tone: "failed" }],
  ["uncertain", { label: "Outcome pending", tone: "uncertain" }],
]);

const UNKNOWN_STATUS: StatusWords = { label: "Unknown", tone: "uncertain" };

export const statusWords = (status: TaskStatus): StatusWords =>
  STATUS_WORDS.get(status) ?? UNKNOWN_STATUS;

/** Still moving: worth polling for. */
export const isSettling = (status: TaskStatus): boolean =>
  statusWords(status).tone === "settling" || status === "uncertain";

const SERVICE_ICONS: ReadonlyMap<ServiceName, LucideIcon> = new Map([
  ["x_search", RadioIcon],
  ["web_search", SearchIcon],
  ["image", ImageIcon],
  ["inference", MessagesSquareIcon],
  ["speech", AudioLinesIcon],
]);

export const serviceIcon = (name: ServiceName): LucideIcon =>
  SERVICE_ICONS.get(name) ?? SearchIcon;

export interface ReadinessBadge {
  readonly className: string;
  readonly label: string;
}

/** Simulated wears the stub colour every other stub in the product wears. */
export const readinessBadge = (
  status: ServiceCard["status"]
): ReadinessBadge => {
  if (status === "demo") {
    return {
      className: "border-drive-agent/60 text-drive-agent-foreground",
      label: "Simulated",
    };
  }
  if (status === "configured") {
    return { className: "border-brand/40 text-brand", label: "Ready" };
  }
  return { className: "text-muted-foreground", label: "Unavailable" };
};

/** Only http(s) links leave the page; anything else is text. */
export const safeLink = (url: string): string | undefined => {
  try {
    const value = new URL(url);
    return value.protocol === "https:" || value.protocol === "http:"
      ? value.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const EXTENSIONS: ReadonlyMap<string, string> = new Map([
  ["audio/mpeg", "mp3"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const artifactFilename = (mime: string | null, id: string): string =>
  `froggy-${id}.${EXTENSIONS.get(mime ?? "") ?? "bin"}`;

/** The button's word for what the person is about to do, with the price. */
export const runLabel = (card: ServiceCard, price: string): string =>
  card.status === "demo" ? `Try simulated · ${price}` : `Run · ${price}`;
