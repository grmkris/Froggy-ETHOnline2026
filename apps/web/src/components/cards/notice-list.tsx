/** Things the socket said that are not state: protocol errors, mostly. */

import { Button } from "@froggy/ui/components/button";
import { XIcon } from "lucide-react";

import type { Notice } from "../../lib/app-state";

interface NoticeListProps {
  readonly notices: readonly Notice[];
  readonly onDismiss: (id: string) => void;
}

export const NoticeList = ({
  notices,
  onDismiss,
}: NoticeListProps): React.ReactElement | null =>
  notices.length === 0 ? null : (
    <ul className="space-y-1.5">
      {notices.map((notice) => (
        <li
          className="bg-refused-soft flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
          key={notice.id}
          role="alert"
        >
          <span className="flex-1">{notice.text}</span>
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
