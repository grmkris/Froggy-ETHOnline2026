/**
 * The wallet, as rows.
 *
 * `wallet_status` answers the model in JSON, and JSON is not what a person
 * reads. The same object as a small table: the address, what this window
 * has spent, what the pocket holds, and how
 * many rules the mandate carries.
 */

import { formatUsd } from "@froggy/domain";
import type { ReactElement } from "react";

import { shortAddress } from "../../lib/format";
import type { WalletStatus } from "../../lib/wallet-status";

const Row = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement => (
  <tr className="[&>td]:py-0.5 [&>td]:pr-4">
    <td className="text-muted-foreground">{label}</td>
    <td className="text-foreground/80">{value}</td>
  </tr>
);

export const WalletStatusCard = ({
  status,
}: {
  readonly status: WalletStatus;
}): ReactElement => {
  const rules = status.rules ?? [];
  return (
    <table className="text-machine mx-3 mb-3 ml-9">
      <tbody>
        <Row label="address" value={shortAddress(status.address ?? null)} />
        <Row
          label="spent this window"
          value={formatUsd(status.windowSpentUsdMicros)}
        />
        {status.pocketUsdMicros === null ||
        status.pocketUsdMicros === undefined ? null : (
          <Row label="pocket" value={formatUsd(status.pocketUsdMicros)} />
        )}
        {status.hederaAccountId === null ||
        status.hederaAccountId === undefined ? null : (
          <Row label="hedera account" value={status.hederaAccountId} />
        )}
        <Row
          label="rules"
          value={`${rules.length}${rules.length === 0 ? "" : `: ${rules.map((rule) => rule._tag.replaceAll("_", " ")).join(", ")}`}`}
        />
      </tbody>
    </table>
  );
};
