/**
 * What the agent says to the person without being asked.
 *
 * Three sources: the `notify` tool, a reminder coming due, and the report
 * of an unattended turn. Each goes to the person's phone when a Telegram
 * pairing exists, and to the web stream always, as a `notice` message the
 * tab files in the margin — so the stream shows what was said and whether
 * the phone saw it, and a screenshot of the web app cannot imply a message
 * reached Telegram when it did not.
 *
 * Never throws. A notice is best-effort by nature; the turn or tick that
 * produced it has already done its work, and a failed post is a warning in
 * the log, not a reason to unwind anything.
 */

import { NoticeId } from "@froggy/domain";
import type { RunId, ScheduleId, UserId } from "@froggy/domain";
import type { AppServerMessage, Notice, NoticeSource } from "@froggy/protocol";

/** What a notice may say. Capped like a tool output: it reaches every later prompt via Telegram history. */
const NOTICE_CAP = 1000;

interface NoticeInput {
  readonly runId?: RunId | null;
  readonly scheduleId?: ScheduleId | null;
  readonly source: NoticeSource;
  readonly text: string;
}

export interface NoticesDeps {
  readonly now?: () => number;
  /**
   * Post to the person's paired Telegram thread. Resolves true when it was
   * paired and posted. Late-bound to the pager, which is built after the
   * turn machinery that needs to notify.
   */
  readonly notify: (userId: UserId, text: string) => Promise<boolean>;
  readonly publishApp: (userId: UserId, message: AppServerMessage) => void;
}

export interface Notices {
  /** Deliver, then answer the notice as filed, with `telegram` truthful. */
  readonly post: (userId: UserId, input: NoticeInput) => Promise<Notice>;
}

const capped = (text: string): string =>
  text.length <= NOTICE_CAP ? text : `${text.slice(0, NOTICE_CAP)}…`;

export const createNotices = (deps: NoticesDeps): Notices => {
  const now = deps.now ?? Date.now;
  return {
    post: async (userId, input) => {
      const text = capped(input.text);
      let telegram = false;
      // A scheduled run's report already went to Telegram as a card; the
      // notice is for the web stream only, or the phone would hear it twice.
      if (input.source !== "scheduled_run") {
        try {
          telegram = await deps.notify(userId, text);
        } catch (error) {
          console.warn(
            `notice to ${userId} did not reach Telegram:`,
            error instanceof Error ? error.message : error
          );
        }
      }
      const notice: Notice = {
        at: now(),
        id: NoticeId.generate(),
        runId: input.runId ?? null,
        scheduleId: input.scheduleId ?? null,
        source: input.source,
        telegram,
        text,
      };
      try {
        deps.publishApp(userId, { notice, type: "notice", v: 1 });
      } catch (error) {
        console.warn(
          `notice to ${userId} did not reach the web stream:`,
          error instanceof Error ? error.message : error
        );
      }
      return notice;
    },
  };
};
