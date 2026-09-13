import { Button } from "@froggy/ui/components/button";
import { SlidersHorizontalIcon } from "lucide-react";
import type { ReactElement } from "react";

import { CreditLimitsForm } from "../wallet/credits-panel";
import { StepActions, StepGlyph, StepHeading } from "./frame";

export const RulesStep = ({
  onBack,
  onContinue,
}: {
  readonly onBack: () => void;
  readonly onContinue: () => void;
}): ReactElement => (
  <>
    <StepHeading
      title="Set your credit limits."
      detail="Froggy uses prepaid credits for tools and browser tasks. Choose the most it can use per task and in 24 hours."
      illustration={
        <StepGlyph>
          <SlidersHorizontalIcon aria-hidden className="size-6" />
        </StepGlyph>
      }
    />
    <CreditLimitsForm />
    <p className="text-muted-foreground text-sm">
      You start with zero credits. Only you can buy more with USDC or HBAR.
      Tasks within these limits run without asking each time.
    </p>
    <p className="text-muted-foreground text-sm">
      Wallet permissions for trading and external purchases are separate. You
      can set those in Account when you need them.
    </p>
    <StepActions
      back={onBack}
      primary={<Button onClick={onContinue}>Continue</Button>}
    />
  </>
);
