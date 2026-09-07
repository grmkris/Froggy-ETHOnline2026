/**
 * The mandate, set from a test without a screen for it.
 *
 * The product hides spending limits, so no page edits a threshold any more;
 * the browser tests still need one to exercise the approval round trip. The
 * app socket accepts `mandate.update`, and the test server keeps limits on,
 * so the test speaks that message itself: it waits for the first mandate the
 * server publishes, lowers (or adds) the threshold, and resolves `applied`
 * when the server has echoed the mandate back with the new value.
 */

import type { Page } from "@playwright/test";

import { RuleId, usdMicros } from "../packages/domain/src";
import {
  decodeAppServerMessage,
  encodeAppClientMessage,
} from "../packages/protocol/src/app";

export interface Leash {
  /** Resolves once the server has published the mandate with the threshold. */
  readonly applied: Promise<null>;
}

/** Call before `page.goto`. */
export const lowerApprovalThreshold = async (
  page: Page,
  usd: number
): Promise<Leash> => {
  const overUsdMicros = usdMicros(Math.round(usd * 1_000_000));
  const done = Promise.withResolvers<null>();
  let sent = false;
  await page.routeWebSocket("**/ws/app", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      socket.send(message);
      const decoded = decodeAppServerMessage(String(message));
      if (
        decoded._tag !== "Success" ||
        decoded.success.type !== "mandate.state"
      ) {
        return;
      }
      const { mandate } = decoded.success;
      const current = mandate.rules.find(
        (rule) => rule._tag === "approval_threshold"
      );
      if (
        current?._tag === "approval_threshold" &&
        current.overUsdMicros === overUsdMicros
      ) {
        done.resolve(null);
        return;
      }
      if (sent) {
        return;
      }
      sent = true;
      const rules =
        current === undefined
          ? [
              ...mandate.rules,
              {
                _tag: "approval_threshold" as const,
                id: RuleId.generate(),
                overUsdMicros,
              },
            ]
          : mandate.rules.map((rule) =>
              rule._tag === "approval_threshold"
                ? { ...rule, overUsdMicros }
                : rule
            );
      server.send(
        encodeAppClientMessage({
          mandate: { ...mandate, rules },
          type: "mandate.update",
          v: 1,
        })
      );
    });
  });
  return { applied: done.promise };
};
