import { AlertDialogMedia } from "@froggy/ui";
import { OctagonAlertIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

export const Icons = () => (
  <div className="flex items-center gap-3">
    <AlertDialogMedia>
      <OctagonAlertIcon />
    </AlertDialogMedia>
    <AlertDialogMedia>
      <TriangleAlertIcon />
    </AlertDialogMedia>
    <AlertDialogMedia>
      <TrashIcon />
    </AlertDialogMedia>
  </div>
);
