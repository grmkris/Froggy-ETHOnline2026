/** One service: what it does, what it costs, whether it is real here. */

import { formatUsd } from "@froggy/domain";
import type { ServiceCard as Card } from "@froggy/protocol";
import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card as CardFrame,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { ArrowUpRightIcon } from "lucide-react";
import { createElement } from "react";
import type { ReactElement } from "react";

import { readinessBadge, serviceIcon } from "../../lib/services-view";

export const ServiceCard = ({
  card,
  onChoose,
  selected,
}: {
  readonly card: Card;
  readonly onChoose: () => void;
  readonly selected: boolean;
}): ReactElement => {
  const readiness = readinessBadge(card.status);
  const noteId = `service-note-${card.name}`;
  return (
    <CardFrame
      className={`transition-shadow duration-150 ${selected ? "ring-ring ring-2" : ""}`}
      data-selected={selected ? "" : undefined}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-xl">
            {createElement(serviceIcon(card.name), {
              "aria-hidden": true,
              className: "size-5",
            })}
          </span>
          <Badge className="tabular-nums" variant="secondary">
            {formatUsd(card.priceUsdMicros)}
          </Badge>
        </div>
        <CardTitle className="pt-1">{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{card.provider}</span>
        <Badge className={readiness.className} variant="outline">
          {readiness.label}
        </Badge>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button
          aria-label={`Choose ${card.title.toLowerCase()}`}
          aria-describedby={card.status === "unavailable" ? noteId : undefined}
          className="min-h-11 w-full justify-between"
          disabled={card.status === "unavailable"}
          onClick={onChoose}
          variant={selected ? "default" : "outline"}
        >
          Choose service
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
        {card.status === "unavailable" ? (
          <p className="text-muted-foreground text-xs" id={noteId}>
            {card.note}
          </p>
        ) : null}
      </CardFooter>
    </CardFrame>
  );
};
