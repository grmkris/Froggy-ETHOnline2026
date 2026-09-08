/**
 * The wallet, as rows.
 *
 * `wallet_status` answers the model in JSON, and JSON is not what a person
 * reads. The same object as a small table: the address, what this window
 * has spent, the one balance, and the Hedera account.
 */

import { formatUsd } from "@froggy/domain";
import type { ReactElement } from "react";

import { shortAddress } from "../../lib/format";
import type { WalletStatus } from "../../lib/wallet-status";
import { MorphText } from "../morph-text";

const Row = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement => (
  <tr className="[&>td]:py-0.5 [&>td]:pr-4">
    <td className="text-muted-foreground">{label}</td>
    <MorphText as="td" className="text-foreground/80">
      {value}
    </MorphText>
  </tr>
);

export const WalletStatusCard = ({
  status,
}: {
  readonly status: WalletStatus;
}): ReactElement => (
  <table className="text-machine mx-3 mb-3 ml-9">
    <tbody>
      <Row label="address" value={shortAddress(status.address ?? null)} />
      <Row
        label="spent this window"
        value={formatUsd(status.windowSpentUsdMicros)}
      />
      {status.totalUsdMicros === null ||
      status.totalUsdMicros === undefined ? null : (
        <Row label="balance" value={formatUsd(status.totalUsdMicros)} />
      )}
      {status.hederaAccountId === null ||
      status.hederaAccountId === undefined ? null : (
        <Row label="hedera account" value={status.hederaAccountId} />
      )}
    </tbody>
  </table>
);
