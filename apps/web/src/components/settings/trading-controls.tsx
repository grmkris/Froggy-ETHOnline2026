/** The trading leash on Account: one switch that stops signing, and the rules an agent may trade under. The card around it carries the title. */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Button } from "@froggy/ui/components/button";
import { FieldError } from "@froggy/ui/components/field";
import type { ReactElement } from "react";

import { useTrades } from "../../hooks/use-trades";
import { useWorkspace } from "../../lib/workspace-context";
import { TradingRules } from "../trading/trading-rules";

export const TradingControls = (): ReactElement => {
  const { app } = useWorkspace();
  const api = useTrades(app.sessionId);
  const stopped = api.stopped.data?.stopped === true;
  return (
    <section aria-label="Trading controls" className="flex flex-col gap-4">
      <div>
        <Button
          className={stopped ? "min-h-11" : "text-destructive min-h-11"}
          disabled={api.stop.isPending || !api.enabled}
          onClick={() => {
            api.stop.mutate(!stopped);
          }}
          variant="outline"
        >
          {stopped ? "Resume trading" : "Stop trading"}
        </Button>
      </div>
      {stopped ? (
        <Alert>
          <AlertTitle>Trading stopped</AlertTitle>
          <AlertDescription>
            New signing attempts are blocked. Submitted transactions can still
            settle and remain available for reconciliation.
          </AlertDescription>
        </Alert>
      ) : null}
      {api.stop.isError ? (
        <FieldError>{api.stop.error.message}</FieldError>
      ) : null}
      <TradingRules sessionId={app.sessionId} trading={api} />
    </section>
  );
};
