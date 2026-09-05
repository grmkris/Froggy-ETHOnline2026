/**
 * The directory: paid endpoints the person has said yes to.
 *
 * An entry is what a probe found plus the person's decision to keep it. The
 * host and the payee go onto the mandate's allowlists when an entry is
 * added, which is the only way a 402 that is not ours becomes payable — so
 * "the agent paid a stranger" always traces to a row here that a person made.
 */

import { Schema } from "effect";

import { DirectoryId } from "./id";

export const DirectoryEntry = Schema.Struct({
  addedAt: Schema.Int,
  /** In the asset's smallest unit, as the seller quoted it at probe time. */
  amount: Schema.String,
  asset: Schema.String,
  host: Schema.String,
  id: DirectoryId,
  label: Schema.String,
  network: Schema.String,
  payTo: Schema.String,
  url: Schema.String,
});
export type DirectoryEntry = typeof DirectoryEntry.Type;
