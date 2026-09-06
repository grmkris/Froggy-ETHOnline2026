/**
 * Control messages on the browser socket.
 *
 * The socket carries two things: binary screencast frames server→client (see
 * `frames.ts`), and these JSON control messages in both directions. Keeping
 * them on one socket means the human's click and the frame it produces cannot
 * be reordered relative to each other by two independent transports.
 */

import { ProtocolVersion, TabId } from "@froggy/domain";
import { Schema } from "effect";

const Envelope = { v: ProtocolVersion };

/**
 * Who is driving the page right now.
 *
 * `idle` is not "nobody connected" — it is "nobody is currently acting", which
 * is the state the agent may enter from. Collapsing it into `agent` would mean
 * the badge lies about whether work is happening.
 */
export const InteractionMode = Schema.Literals(["agent", "human", "idle"]);
export type InteractionMode = typeof InteractionMode.Type;

const MouseKind = Schema.Literals([
  "mousePressed",
  "mouseReleased",
  "mouseMoved",
  "mouseWheel",
]);

/**
 * A pointer event in **bitmap** coordinates, not CSS pixels.
 *
 * The client scales by `bitmap.width / rect.width` before sending, because the
 * canvas is displayed at whatever size the layout gives it and the page only
 * understands its own device pixels.
 */
const MouseInput = Schema.Struct({
  ...Envelope,
  button: Schema.Literals(["none", "left", "middle", "right"]),
  buttons: Schema.Int,
  clickCount: Schema.Int,
  deltaX: Schema.Finite,
  deltaY: Schema.Finite,
  kind: MouseKind,
  /** CDP bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8. */
  modifiers: Schema.Int,
  type: Schema.Literals(["input.mouse"]),
  x: Schema.Finite,
  y: Schema.Finite,
});

/**
 * A non-printable key. Printable characters do **not** come through here — they
 * arrive as `input.text` from the hidden input's `input` event, which is the
 * only way an IME composition survives the trip.
 */
const KeyInput = Schema.Struct({
  ...Envelope,
  code: Schema.String,
  down: Schema.Boolean,
  key: Schema.String,
  modifiers: Schema.Int,
  type: Schema.Literals(["input.key"]),
  /** Sites read `e.keyCode`, so it is sent rather than left for Chrome to infer. */
  virtualKeyCode: Schema.Int,
});

const TextInput = Schema.Struct({
  ...Envelope,
  text: Schema.String,
  type: Schema.Literals(["input.text"]),
});

export const BrowserClientMessage = Schema.Union([
  KeyInput,
  MouseInput,
  TextInput,
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(["browser.start"]),
    url: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(["browser.navigate"]),
    url: Schema.String,
  }),
  Schema.Struct({
    ...Envelope,
    tabId: TabId,
    type: Schema.Literals(["browser.activate-tab"]),
  }),
  Schema.Struct({
    ...Envelope,
    tabId: TabId,
    type: Schema.Literals(["browser.close-tab"]),
  }),
  /**
   * The panic button. Aborts the run *first*, then takes the page — the other
   * order gives the next tool call the page back after the quiet window.
   */
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(["browser.take"]),
  }),
  /**
   * Keepalive. Deliberately its own message and **not** routed through input
   * handling: an input-shaped ping would flip arbitration to `human` on every
   * interval and starve the agent permanently.
   */
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["ping"]),
  }),
]);
export type BrowserClientMessage = typeof BrowserClientMessage.Type;

export const TabSummary = Schema.Struct({
  id: TabId,
  loading: Schema.Boolean,
  title: Schema.String,
  url: Schema.String,
});
export type TabSummary = typeof TabSummary.Type;

export const BrowserStatus = Schema.Literals([
  "idle",
  "starting",
  "running",
  "crashed",
  "unavailable",
]);
export type BrowserStatus = typeof BrowserStatus.Type;

export const BrowserState = Schema.Struct({
  activeTabId: Schema.NullOr(TabId),
  /** Populated when `status` is `crashed` or `unavailable`; the pane shows it verbatim. */
  error: Schema.NullOr(Schema.String),
  interaction: InteractionMode,
  /**
   * Set while this user is waiting for a browser seat. `position` is
   * one-based and `ahead` counts the people before them; the pane says
   * "third in line" from it, and the seat is taken automatically when it
   * frees up.
   */
  queue: Schema.NullOr(
    Schema.Struct({ ahead: Schema.Int, position: Schema.Int })
  ),
  status: BrowserStatus,
  tabs: Schema.Array(TabSummary),
  viewport: Schema.Struct({ height: Schema.Int, width: Schema.Int }),
});
export type BrowserState = typeof BrowserState.Type;

export const BrowserServerMessage = Schema.Union([
  Schema.Struct({
    ...Envelope,
    state: BrowserState,
    type: Schema.Literals(["browser.state"]),
  }),
  Schema.Struct({
    ...Envelope,
    sentAt: Schema.Int,
    type: Schema.Literals(["pong"]),
  }),
]);
export type BrowserServerMessage = typeof BrowserServerMessage.Type;

const ClientWire = Schema.fromJsonString(BrowserClientMessage);
const ServerWire = Schema.fromJsonString(BrowserServerMessage);

export const decodeBrowserClientMessage =
  Schema.decodeUnknownResult(ClientWire);
export const decodeBrowserServerMessage =
  Schema.decodeUnknownResult(ServerWire);
export const encodeBrowserClientMessage = Schema.encodeSync(ClientWire);
export const encodeBrowserServerMessage = Schema.encodeSync(ServerWire);
