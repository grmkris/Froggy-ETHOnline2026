/**
 * What Froggy says on Telegram.
 *
 * Cards, so the four approval answers are buttons and
 * not instructions to type. The same four answers in the same order as the
 * web ticket; the wire just looks different. Built with the SDK's element
 * functions rather than JSX, so this file needs no runtime pragma.
 */

import { formatUsd } from "@froggy/domain";
import type { ApprovalKind } from "@froggy/domain";
import type { ApprovalRequest } from "@froggy/protocol";
import { Actions, Button, Card, CardText, Field, Fields } from "chat";
import type { ButtonStyle, CardElement } from "chat";

import type { JobReport } from "../jobs";

export const APPROVAL_ACTION = "approval";

/** `requestId|optionId`, because a button carries one string. */
const approvalValue = (requestId: string, optionId: string): string =>
  `${requestId}|${optionId}`;

export interface ApprovalAnswer {
  readonly optionId: string;
  readonly requestId: string;
}

export const parseApprovalValue = (
  value: string | undefined
): ApprovalAnswer | null => {
  if (value === undefined) {
    return null;
  }
  const [requestId, optionId] = value.split("|");
  return requestId === undefined ||
    requestId === "" ||
    optionId === undefined ||
    optionId === ""
    ? null
    : { optionId, requestId };
};

/** The primary yes and the dangerous stop stand out; the two middle answers do not. */
const STYLE: Record<ApprovalKind, ButtonStyle> = {
  allow_once: "primary",
  allow_session: "default",
  deny: "default",
  deny_stop: "danger",
};

export const approvalCard = (request: ApprovalRequest): CardElement =>
  Card({
    children: [
      CardText(
        `${request.amountLabel} to ${request.payeeLabel}. ${request.detail}`
      ),
      Actions(
        request.options.map((option) =>
          Button({
            id: APPROVAL_ACTION,
            label: option.label,
            style: STYLE[option.kind],
            value: approvalValue(request.id, option.id),
          })
        )
      ),
    ],
    title: request.title,
  });

const outcomeLine = (report: JobReport): string => {
  if (report.outcome === "skipped") {
    return `Skipped: ${report.reason ?? "no reason given"}.`;
  }
  if (report.outcome === "aborted") {
    return `Stopped early: ${report.reason ?? "unknown reason"}.`;
  }
  return report.summary === "" ? "Nothing to report." : report.summary;
};

/** The report of an unattended turn: the digest's, or a scheduled prompt's. */
export const reportCard = (report: JobReport): CardElement =>
  Card({
    children: [
      CardText(outcomeLine(report)),
      Fields([
        Field({ label: "Spent", value: formatUsd(report.spentUsdMicros) }),
        Field({ label: "Receipts", value: String(report.receipts.length) }),
        Field({
          label: "Refused",
          value: String(
            report.receipts.filter(
              (receipt) => receipt.decision._tag === "deny"
            ).length
          ),
        }),
      ]),
    ],
    title: report.title,
  });

export const pairedCard = (): CardElement =>
  Card({
    children: [
      CardText(
        "This chat is now your pager. Reminders, scheduled runs and your daily digest land here, approval questions come here with buttons, and you can talk to the agent by writing to it."
      ),
    ],
    title: "Paired with Froggy",
  });
