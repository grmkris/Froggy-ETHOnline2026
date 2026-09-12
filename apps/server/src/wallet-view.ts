/**
 * A stored dapp request as the web app shows it.
 */

import type { DappAssessment, WalletRequest } from "@froggy/domain";
import type { WalletRequestView } from "@froggy/protocol";

const KIND_TITLE: Record<WalletRequest["kind"], string> = {
  connect: "Connect this site",
  personal_sign: "Sign a message",
  send_transaction: "Send a transaction",
  sign_typed_data_v4: "Sign typed data",
};

export const walletRequestView = (
  request: WalletRequest,
  assessment?: DappAssessment
): WalletRequestView => ({
  approvalId: request.approvalId,
  chainId: request.chainId,
  createdAt: request.createdAt,
  delivery: request.delivery,
  error: request.error,
  expiresAt: request.expiresAt,
  id: request.id,
  initiatedDuring: request.initiatedDuring,
  kind: request.kind,
  origin: request.origin,
  status: request.status,
  stubbed: request.stubbed,
  summary: assessment === undefined ? request.summary : [...assessment.lines],
  title: assessment?.title ?? KIND_TITLE[request.kind],
  transactionHash: request.transactionHash,
  updatedAt: request.updatedAt,
});
