/** The five services as cards, or the reason they cannot be shown. */

import type { ServiceCard as Card, ServiceName } from "@froggy/protocol";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Button } from "@froggy/ui/components/button";
import { Skeleton } from "@froggy/ui/components/skeleton";
import type { ReactElement } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";
import { ServiceCard } from "./service-card";

const PLACEHOLDERS = [0, 1, 2, 3] as const;

export const ServiceCatalog = ({
  catalog,
  onChoose,
  selected,
}: {
  readonly catalog: ServiceApi["catalog"];
  readonly onChoose: (card: Card) => void;
  readonly selected: ServiceName | null;
}): ReactElement => {
  if (catalog.isPending) {
    return (
      <output
        aria-label="Loading services"
        className="grid gap-3 sm:grid-cols-2"
      >
        {PLACEHOLDERS.map((index) => (
          <Skeleton className="h-52 w-full rounded-xl" key={index} />
        ))}
      </output>
    );
  }
  if (catalog.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn’t load the services.</AlertTitle>
        <AlertDescription>{catalog.error.message}</AlertDescription>
        <AlertAction>
          <Button
            onClick={() => {
              void catalog.refetch();
            }}
            size="sm"
            variant="outline"
          >
            Retry
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {catalog.data.services.map((card) => (
        <ServiceCard
          card={card}
          key={card.name}
          onChoose={() => {
            onChoose(card);
          }}
          selected={selected === card.name}
        />
      ))}
    </div>
  );
};
