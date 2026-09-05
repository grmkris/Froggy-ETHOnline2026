/**
 * The kill switch, as a button.
 *
 * Freezing is one click, no confirmation: the moment somebody wants it is
 * the moment they want it. Unfreezing asks, because it hands the agent the
 * wallet back, and because a stray click on a frozen wallet should not be
 * what un-freezes it.
 */

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
import { SnowflakeIcon } from "lucide-react";

interface FreezeButtonProps {
  readonly frozen: boolean;
  readonly onFreeze: (frozen: boolean) => void;
}

export const FreezeButton = ({
  frozen,
  onFreeze,
}: FreezeButtonProps): React.ReactElement =>
  frozen ? (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            className="border-drive-frozen text-foreground"
            size="sm"
            variant="outline"
          >
            <SnowflakeIcon data-icon="inline-start" />
            Frozen · unfreeze
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Hand the wallet back to the agent?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Unfreezing restores the mandate, the browser and the agent&apos;s
            signer. Nothing that was stopped resumes on its own.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it frozen</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onFreeze(false);
            }}
          >
            Unfreeze
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <Button
      className="border-destructive/30 text-destructive hover:bg-refused-soft"
      onClick={() => {
        onFreeze(true);
      }}
      size="sm"
      variant="outline"
    >
      <SnowflakeIcon data-icon="inline-start" />
      Freeze
    </Button>
  );
