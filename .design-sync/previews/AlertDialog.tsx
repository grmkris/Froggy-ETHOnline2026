import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@froggy/ui";
import { OctagonAlertIcon } from "lucide-react";

export const Open = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia>
          <OctagonAlertIcon />
        </AlertDialogMedia>
        <AlertDialogTitle>Stop the agent?</AlertDialogTitle>
        <AlertDialogDescription>
          It will finish nothing it has started, and nothing further will be
          spent until you start it again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep going</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Stop it</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const Small = () => (
  <AlertDialog open>
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke this agent?</AlertDialogTitle>
        <AlertDialogDescription>
          Its receipts stay; its ability to spend does not.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive">Revoke</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
