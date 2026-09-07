/** The way out: everything Froggy holds for the person, gone, after one question. */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
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
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement } from "react";

export const DeleteData = ({
  onConfirm,
}: {
  readonly onConfirm: () => Promise<void>;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const remove = useMutation({ mutationFn: onConfirm, retry: false });
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!remove.isPending) {
          setOpen(next);
          if (next) {
            remove.reset();
          }
        }
      }}
    >
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
            any running turn is stopped. Payments that already settled stay in
            the ledger, because money that moved is not a preference.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t confirm deletion.</AlertTitle>
            <AlertDescription>
              Your data may still be here. Try again.
            </AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={remove.isPending}>
            Keep it
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
            variant="destructive"
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
