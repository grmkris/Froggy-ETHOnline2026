/**
 * The request for one chosen service: a bounded prompt, the price on the
 * button, and a plain word about what a simulated run is.
 */

import { formatUsd } from "@froggy/domain";
import type { ServiceCard } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Button } from "@froggy/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Spinner } from "@froggy/ui/components/spinner";
import { Textarea } from "@froggy/ui/components/textarea";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";
import { runLabel } from "../../lib/services-view";

export const ServiceRequestForm = ({
  card,
  onBack,
  onStarted,
  run,
}: {
  readonly card: ServiceCard;
  readonly onBack: () => void;
  readonly onStarted: () => void;
  readonly run: ServiceApi["run"];
}): ReactElement => {
  const inputId = useId();
  const [prompt, setPrompt] = useState("");
  // A fresh key per change: the same words twice are the same task, a
  // changed request is a new one.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const price = formatUsd(card.priceUsdMicros);
  return (
    <form
      aria-label={`Request ${card.title}`}
      className="bg-card shadow-card flex flex-col gap-4 rounded-2xl p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (prompt.trim() === "" || run.isPending) {
          return;
        }
        run.mutate(
          { idempotencyKey: key, prompt, service: card.name },
          {
            onSuccess: () => {
              setPrompt("");
              setKey(crypto.randomUUID());
              onStarted();
            },
          }
        );
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">{card.title}</h3>
        <Button
          className="min-h-11"
          disabled={run.isPending}
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          Back
        </Button>
      </div>
      {card.status === "demo" ? (
        <Alert>
          <AlertTitle>Simulated on this build.</AlertTitle>
          <AlertDescription>
            There is no live provider here. The result is a fixture and is
            marked as one.
          </AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor={inputId}>Your request</FieldLabel>
        <Textarea
          aria-describedby={`${inputId}-help`}
          className="min-h-24"
          disabled={run.isPending}
          id={inputId}
          maxLength={card.maxInput}
          onChange={(event) => {
            setPrompt(event.target.value);
            setKey(crypto.randomUUID());
            run.reset();
          }}
          required
          value={prompt}
        />
        <FieldDescription id={`${inputId}-help`}>
          {card.description}{" "}
          <output className="tabular-nums">
            {prompt.length}/{card.maxInput}
          </output>
        </FieldDescription>
        {run.isError ? <FieldError>{run.error.message}</FieldError> : null}
      </Field>
      <p className="text-muted-foreground text-xs">
        {card.note} Once paid, failed work is not automatically refunded.
      </p>
      <Button
        className="min-h-11 self-start"
        disabled={run.isPending || prompt.trim() === ""}
        type="submit"
      >
        {run.isPending ? (
          <>
            <Spinner data-icon="inline-start" label="Starting" />
            Starting…
          </>
        ) : (
          runLabel(card, price)
        )}
      </Button>
    </form>
  );
};
