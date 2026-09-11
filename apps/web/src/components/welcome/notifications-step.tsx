/**
 * Step three: where Froggy reaches you.
 *
 * Telegram by code and the daily digest — the same two controls Connections
 * and Account hold, mounted here once. Continue works whether or not a code
 * was pasted: the pairing finishes on its own, and there is no separate
 * "later" because continuing unpaired is the later.
 */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import type { ReactElement } from "react";

import { TelegramSettings } from "../agents/telegram-settings";
import { DigestSettings } from "../settings/digest-settings";
import { StepActions, StepHeading } from "./frame";

export const NotificationsStep = ({
  configured,
  onBack,
  onContinue,
}: {
  /** Telegram is live on this deployment, so a code can be minted. */
  readonly configured: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
}): ReactElement => (
  <>
    <StepHeading
      detail="Get a message when something needs you. Telegram is the one channel for now, and you can add it later."
      illustration={<FrogMark className="size-12" pose="needs-user" />}
      title="When Froggy needs you."
    />
    <TelegramSettings active configured={configured} />
    <section
      aria-label="Daily digest"
      className="bg-muted shadow-inset rounded-xl p-4 text-sm"
    >
      <DigestSettings withTest={false} />
    </section>
    <StepActions
      back={onBack}
      note={
        <span>
          Both live in Connections and Account as well, whenever you want them.
        </span>
      }
      primary={
        <Button className="min-h-11" onClick={onContinue}>
          Continue
        </Button>
      }
    />
  </>
);
