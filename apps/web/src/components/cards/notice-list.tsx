/** Things the socket said that are not state: protocol errors, turns started elsewhere. */

import { Button } from "@froggy/ui/components/button";
import { XIcon } from "lucide-react";

import type { Notice } from "../../lib/app-state";

interface NoticeListProps {
  readonly notices: readonly Notice[];
  readonly onDismiss: (id: string) => void;
}

const TONE: Record<Notice["tone"], string> = {
  error: "bg-refused-soft",
  info: "bg-brand-soft",
};

export const NoticeList = ({
  notices,
  onDismiss,
}: NoticeListProps): React.ReactElement | null =>
  notices.length === 0 ? null : (
    <ul className="space-y-1.5">
      {notices.map((notice) => (
        <li
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${TONE[notice.tone]}`}
          key={notice.id}
          role="alert"
        >
          <span className="flex-1">{notice.text}</span>
          {notice.tone === "info" ? (
            <Button
              onClick={() => {
                globalThis.location.reload();
              }}
              size="xs"
              variant="secondary"
            >
              Reload
            </Button>
          ) : null}
          <Button
            aria-label="Dismiss"
            onClick={() => {
              onDismiss(notice.id);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
