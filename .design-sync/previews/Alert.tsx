import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Button,
} from "@froggy/ui";
import { AlertTriangleIcon, InfoIcon } from "lucide-react";

export const Default = () => (
  <Alert className="w-96">
    <InfoIcon />
    <AlertTitle>The agent is paused</AlertTitle>
    <AlertDescription>
      Nothing will be spent until you start it again.
    </AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert className="w-96" variant="destructive">
    <AlertTriangleIcon />
    <AlertTitle>Spend refused: over the daily cap</AlertTitle>
    <AlertDescription>
      $32.10 would have taken today past $25.00. The receipt records the rule
      that stopped it.
    </AlertDescription>
  </Alert>
);

export const WithAction = () => (
  <Alert className="w-96">
    <InfoIcon />
    <AlertTitle>A new agent asked to connect</AlertTitle>
    <AlertDescription>
      It cannot spend anything until you give it a rule.
    </AlertDescription>
    <AlertAction>
      <Button size="xs" variant="outline">
        Review
      </Button>
    </AlertAction>
  </Alert>
);

export const TitleOnly = () => (
  <Alert className="w-96">
    <AlertTitle>Receipts are up to date.</AlertTitle>
  </Alert>
);
