import { MailIcon } from "lucide-react";

import { EmailAccount } from "../email/email-account";
import { StepGlyph, StepHeading } from "./frame";

export const EmailStep = ({
  onBack,
  onContinue,
}: {
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) => (
  <>
    <StepHeading
      title="Give Froggy an email address."
      detail="An inbox for sign-up codes, confirmations and the work you do together. Froggy can read incoming mail; you approve every outgoing message."
      illustration={
        <StepGlyph>
          <MailIcon className="size-6" />
        </StepGlyph>
      }
    />
    <p className="text-muted-foreground text-sm">
      Optional. No mailbox connection or DNS setup needed.
    </p>
    <EmailAccount onBack={onBack} onContinue={onContinue} />
  </>
);
