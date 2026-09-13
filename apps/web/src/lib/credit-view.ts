import type { CreditChargeStatus } from "@froggy/domain";
import { Schema } from "effect";

/** Credit precision stays independent of display rounding: 10,000 units is one credit. */
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export const creditNumber = (units: number): string =>
  number.format(units / 10_000);

export const formatCredits = (units: number): string =>
  `${creditNumber(units)} ${units === 10_000 ? "credit" : "credits"}`;

/** Dollar purchases are entered in cents; floating-point rounding never chooses the charge. */
export const purchaseAmount = (value: string): number | null => {
  const parts = /^(?<whole>\d{1,3})(?:\.(?<fraction>\d{1,2}))?$/u.exec(
    value.trim()
  )?.groups;
  if (!parts) {
    return null;
  }
  const cents =
    Number(parts["whole"]) * 100 +
    Number((parts["fraction"] ?? "").padEnd(2, "0"));
  return cents >= 100 && cents <= 10_000 ? cents * 10_000 : null;
};

export const creditLimit = (
  value: FormDataEntryValue | null
): number | null => {
  const parsed = Schema.decodeUnknownResult(Schema.String)(value);
  if (
    parsed._tag === "Failure" ||
    !/^\d+(?:\.\d{1,4})?$/u.test(parsed.success)
  ) {
    return null;
  }
  const [whole, fraction = ""] = parsed.success.split(".");
  const units = Number(whole) * 10_000 + Number(fraction.padEnd(4, "0"));
  return Number.isSafeInteger(units) && units >= 0 ? units : null;
};

const CHARGE_WORDS: Record<CreditChargeStatus, string> = {
  captured: "used",
  released: "returned",
  refused: "refused",
  uncertain: "held · outcome pending",
  reserved: "held",
};
export const creditChargeWords = (
  status: CreditChargeStatus | undefined
): string => (status === undefined ? "held" : CHARGE_WORDS[status]);
