import { AlertDialogHeader, AlertDialogMedia } from "@froggy/ui";
import { OctagonAlertIcon } from "lucide-react";

export const Default = () => (
  <div className="bg-popover ring-foreground/10 w-80 rounded-xl p-4 ring-1">
    <AlertDialogHeader>
      <AlertDialogMedia>
        <OctagonAlertIcon />
      </AlertDialogMedia>
      <div className="text-base font-medium">Stop the agent?</div>
      <div className="text-muted-foreground text-sm text-balance">
        Nothing further will be spent until you start it again.
      </div>
    </AlertDialogHeader>
  </div>
);

export const WithoutMedia = () => (
  <div className="bg-popover ring-foreground/10 w-80 rounded-xl p-4 ring-1">
    <AlertDialogHeader>
      <div className="text-base font-medium">Revoke this agent?</div>
      <div className="text-muted-foreground text-sm text-balance">
        Its receipts stay; its ability to spend does not.
      </div>
    </AlertDialogHeader>
  </div>
);
