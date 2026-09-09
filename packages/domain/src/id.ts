/**
 * TypeID entity identifiers — prefixed, UUIDv7-backed, lexicographically
 * sortable strings such as `rom_01m1pg0264fvjscv3k6a2nxb0h`.
 *
 * `makeIdSchema(prefix, brand)` returns a validating Effect `Schema` whose
 * decoded type is a branded template literal. One declaration produces the
 * wire codec, the type-level brand, the generator, the guard, and the UUID
 * interop used by the database column helpers, so an identifier cannot drift
 * between transport, simulation, and storage.
 *
 * `typeid-js` owns the base32 encoding only. Keeping the Effect surface here
 * rather than depending on an Effect-coupled TypeID library means an Effect
 * release cannot break identifier decoding.
 */

import { Schema } from "effect";
import type { Brand } from "effect";
import { TypeID, fromString, toUUID, typeid } from "typeid-js";

/** Base32-encoded UUIDv7 suffix length, fixed by the TypeID specification. */
const SUFFIX_LENGTH = 26;

/**
 * Prefixes registered so far, mapped to the brand that claimed them. Two
 * entities sharing a prefix would silently accept each other's identifiers,
 * so the collision is raised when the module is imported rather than left to
 * review.
 */
const claimedPrefixes = new Map<string, string>();

/**
 * A branded TypeID string. The template literal keeps the prefix visible to
 * the type checker; the brand stops two identifier types with the same shape
 * from being interchangeable.
 */
export type TypeId<
  Prefix extends string,
  Name extends string,
> = `${Prefix}_${string}` & Brand.Brand<Name>;

/**
 * A validating branded TypeID codec plus the synchronous companions used at
 * the seams Effect does not own: Drizzle default values, narrowing guards,
 * and UUID conversion for `uuid` columns.
 */
export interface IdSchema<
  Prefix extends string,
  Name extends string,
> extends Schema.refine<TypeId<Prefix, Name>, typeof Schema.String> {
  readonly prefix: Prefix;
  readonly generate: () => TypeId<Prefix, Name>;
  readonly is: (input: string) => input is TypeId<Prefix, Name>;
  readonly fromUuid: (uuid: string) => TypeId<Prefix, Name>;
  readonly toUuid: (id: TypeId<Prefix, Name>) => string;
}

export const makeIdSchema = <
  const Prefix extends string,
  const Name extends string,
>(
  prefix: Prefix,
  brand: Name
): IdSchema<Prefix, Name> => {
  const claimedBy = claimedPrefixes.get(prefix);
  if (claimedBy !== undefined) {
    throw new Error(
      `TypeID prefix "${prefix}" is already claimed by ${claimedBy}; prefixes must be unique.`
    );
  }
  claimedPrefixes.set(prefix, brand);

  const expectedLength = prefix.length + 1 + SUFFIX_LENGTH;

  const is = (input: string): input is TypeId<Prefix, Name> => {
    if (input.length !== expectedLength || !input.startsWith(`${prefix}_`)) {
      return false;
    }
    try {
      // The length and prefix checks above are cheap but not sufficient: the
      // suffix must also be lowercase Crockford base32 that does not overflow
      // 128 bits. `fromString` throws on both, and it is the only place that
      // check exists, so a junk `rom_0…` would otherwise reach the driver.
      TypeID.fromString(input, prefix);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * The only place a plain string becomes a branded identifier. Every producer
   * routes through it, so an unchecked value cannot acquire the brand.
   */
  const assertId = (candidate: string): TypeId<Prefix, Name> => {
    if (!is(candidate)) {
      throw new Error(`"${candidate}" is not a valid ${brand}.`);
    }
    return candidate;
  };

  const schema = Schema.String.pipe(
    Schema.refine(is, {
      identifier: brand,
      message: `Expected a "${prefix}"-prefixed TypeID`,
    })
  );

  return Object.assign(schema, {
    prefix,
    generate: (): TypeId<Prefix, Name> => assertId(typeid(prefix).toString()),
    is,
    fromUuid: (uuid: string): TypeId<Prefix, Name> =>
      assertId(TypeID.fromUUID(prefix, uuid).toString()),
    // Prefix-checked on the way out as well as in. The branded parameter is a
    // compile-time guarantee only, and this is the last checkpoint before a
    // database driver: an identifier from another entity reaching here would
    // otherwise write a valid-looking row under the wrong key.
    toUuid: (id: TypeId<Prefix, Name>): string =>
      toUUID(fromString(id, prefix)),
  });
};

// ---------------------------------------------------------------------------
// Registered identifiers
// ---------------------------------------------------------------------------

/** A workspace session: one human, one wallet, one browser, one agent loop. */
export const SessionId = makeIdSchema("ses", "SessionId");
export type SessionId = typeof SessionId.Type;

/** One agent turn. Owned by the server, not by the HTTP socket that started it. */
export const RunId = makeIdSchema("run", "RunId");
export type RunId = typeof RunId.Type;

/** A tab inside the shared browser. */
export const TabId = makeIdSchema("tab", "TabId");
export type TabId = typeof TabId.Type;

/** One observed payment challenge bound to a browser navigation. */
export const BrowserPaymentId = makeIdSchema("bpay", "BrowserPaymentId");
export type BrowserPaymentId = typeof BrowserPaymentId.Type;

/** A spend mandate: the caps and allowlists the agent is held to. */
export const MandateId = makeIdSchema("mnd", "MandateId");
export type MandateId = typeof MandateId.Type;

/** One rule inside a mandate. Rejections quote this so a refusal is traceable. */
export const RuleId = makeIdSchema("rul", "RuleId");
export type RuleId = typeof RuleId.Type;

/** A row in the spend ledger, written before the outbound call, never after. */
export const SpendId = makeIdSchema("spn", "SpendId");
export type SpendId = typeof SpendId.Type;

/** A settled or refused spend, with the reasoning that produced it. */
export const ReceiptId = makeIdSchema("rct", "ReceiptId");
export type ReceiptId = typeof ReceiptId.Type;

/** One question put to the human about one spend. */
export const ApprovalId = makeIdSchema("apr", "ApprovalId");
export type ApprovalId = typeof ApprovalId.Type;

/** A paid endpoint a person has added to their directory. */
export const DirectoryId = makeIdSchema("dir", "DirectoryId");
export type DirectoryId = typeof DirectoryId.Type;

/**
 * One sale on the seller side: a payment proof accepted, then work owed.
 * Written before the work so a buyer who paid can always find what they bought.
 */
export const SaleId = makeIdSchema("sal", "SaleId");
export type SaleId = typeof SaleId.Type;

/** One delegated task: quoted, paid, run, and retrievable afterwards by this id. */
export const TaskId = makeIdSchema("tsk", "TaskId");
export type TaskId = typeof TaskId.Type;

/** A token an outside agent presents. Identifies the person's workspace, never a person. */
export const AgentTokenId = makeIdSchema("agt", "AgentTokenId");
export type AgentTokenId = typeof AgentTokenId.Type;

/** A reminder or an unattended turn the person asked for, once or on a cadence. */
export const ScheduleId = makeIdSchema("sch", "ScheduleId");
export type ScheduleId = typeof ScheduleId.Type;

/** One message the agent sent the person unasked: a notify, a reminder, a report. */
export const NoticeId = makeIdSchema("ntc", "NoticeId");
export type NoticeId = typeof NoticeId.Type;

/** An MCP client that registered itself: a name and where it may be sent back to. */
export const OAuthClientId = makeIdSchema("oac", "OAuthClientId");
export type OAuthClientId = typeof OAuthClientId.Type;

/** One person's consent to one client, with its scopes. Revoked as a unit. */
export const OAuthGrantId = makeIdSchema("oag", "OAuthGrantId");
export type OAuthGrantId = typeof OAuthGrantId.Type;

/** One durable USDC-to-HBAR conversion. */
export const ConversionId = makeIdSchema("cnv", "ConversionId");
export type ConversionId = typeof ConversionId.Type;

/** One MCP tool call or HTTP task/payment request from a connected agent. */
export const AgentInvocationId = makeIdSchema("aiv", "AgentInvocationId");
export type AgentInvocationId = typeof AgentInvocationId.Type;

/** One HTTP purchase, shared by chat, the browser and connected agents. */
export const PurchaseId = makeIdSchema("pur", "PurchaseId");
export type PurchaseId = typeof PurchaseId.Type;

/** One immutable, unsigned trading quote returned by a provider. */
export const TradeQuoteId = makeIdSchema("tqt", "TradeQuoteId");
export type TradeQuoteId = typeof TradeQuoteId.Type;

export const TradeId = makeIdSchema("trd", "TradeId");
export type TradeId = typeof TradeId.Type;

export const TradeStepId = makeIdSchema("tst", "TradeStepId");
export type TradeStepId = typeof TradeStepId.Type;

export const TradeRuleId = makeIdSchema("trl", "TradeRuleId");
export type TradeRuleId = typeof TradeRuleId.Type;

export const LaunchWatchId = makeIdSchema("lwt", "LaunchWatchId");
export type LaunchWatchId = typeof LaunchWatchId.Type;

export const LaunchEventId = makeIdSchema("lev", "LaunchEventId");
export type LaunchEventId = typeof LaunchEventId.Type;

export const ConversationId = makeIdSchema("cnvrs", "ConversationId");
export type ConversationId = typeof ConversationId.Type;

export const MessageId = makeIdSchema("msg", "MessageId");
export type MessageId = typeof MessageId.Type;

export const ExecutionId = makeIdSchema("exe", "ExecutionId");
export type ExecutionId = typeof ExecutionId.Type;

export const ActivityEventId = makeIdSchema("act", "ActivityEventId");
export type ActivityEventId = typeof ActivityEventId.Type;

export const ArtifactId = makeIdSchema("art", "ArtifactId");
export type ArtifactId = typeof ArtifactId.Type;
