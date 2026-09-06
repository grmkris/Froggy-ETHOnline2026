/**
 * The page's one live region.
 *
 * Visually nothing; to a screen reader, the sentence that matters right now.
 * No `role`: a status role would be read as the drawer's own saved notice,
 * and the tickets no longer announce themselves, so this is the only voice.
 */

import type { Mandate, Receipt } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";
import type { ReactElement } from "react";

import { announcementFor } from "../lib/announcement";

/** Receipts filed after this instant arrived while the person watched. */
const LOADED_AT = Date.now();

export const Announcer = ({
  approvals,
  mandate,
  receipts,
}: {
  readonly approvals: readonly ApprovalRequest[];
  readonly mandate: Mandate | null;
  readonly receipts: readonly Receipt[];
}): ReactElement => (
  <div aria-live="assertive" className="sr-only">
    {announcementFor({ approvals, mandate, receipts, since: LOADED_AT })}
  </div>
);
