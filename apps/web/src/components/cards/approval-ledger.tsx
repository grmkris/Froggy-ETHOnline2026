/**
 * The design pack's four-line money ledger, as a list.
 *
 * Present only when the card carried `breakdown`. An old card without the
 * field still renders as amount-plus-detail. Figures are mono and tabular;
 * unknown lines were omitted at the source rather than invented here.
 */

import { formatUsd } from "@froggy/domain";
import type { ApprovalBreakdownLine } from "@froggy/protocol";

export const ledgerAmount = (line: ApprovalBreakdownLine): string | null => {
  if (line.amountLabel !== undefined) {
    return line.amountLabel;
  }
  if (line.amountUsdMicros === undefined) {
    return null;
  }
  return formatUsd(line.amountUsdMicros);
};

export const ApprovalLedger = ({
  lines,
}: {
  readonly lines: readonly ApprovalBreakdownLine[];
}): React.ReactElement | null => {
  const shown = lines.flatMap((line) => {
    const amount = ledgerAmount(line);
    return amount === null ? [] : [{ ...line, amount }];
  });
  if (shown.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Spend breakdown" className="mt-3 grid gap-1.5">
      {shown.map((line) => (
        <li
          className="flex items-baseline justify-between gap-4 text-sm"
          key={line.label}
        >
          <span className="text-muted-foreground min-w-0">
            {line.label}
            {line.note === undefined ? null : (
              <span className="mt-0.5 block text-xs">{line.note}</span>
            )}
          </span>
          <span className="text-machine text-foreground shrink-0">
            {line.amount}
          </span>
        </li>
      ))}
    </ul>
  );
};
