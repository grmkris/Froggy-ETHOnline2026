/** The way out: everything Froggy holds for the person, gone, after one question. */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@froggy/ui/components/alert-dialog";
import { Button } from "@froggy/ui/components/button";
import type { ReactElement } from "react";

export const DeleteData = ({
  onConfirm,
}: {
  readonly onConfirm: () => void;
}): ReactElement => (
  <AlertDialog>
    <AlertDialogTrigger
      render={
        <Button className="min-h-11" variant="destructive">
          Delete my data
        </Button>
      }
    />
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Delete everything Froggy holds for you?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Your mandate, your receipts and your browser profile are removed and
          any running turn is stopped. Payments that already settled stay in the
          ledger, because money that moved is not a preference.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
