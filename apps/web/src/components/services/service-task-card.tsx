/** One task, from the request to what it cost and what it gave back. */

import { formatUsd } from "@froggy/domain";
import type { ServiceCard, ServiceTicket } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import { Badge } from "@froggy/ui/components/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@froggy/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import { creditChargeWords, formatCredits } from "../../lib/credit-view";
import { ServiceTaskResult } from "./service-task-result";
import { TaskStatusBadge } from "./task-status-badge";

const Standing = ({
  task,
}: {
  readonly task: ServiceTicket;
}): ReactElement | null => {
  if (task.error !== null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The task failed.</AlertTitle>
        <AlertDescription>{task.error}</AlertDescription>
      </Alert>
    );
  }
  if (task.status === "uncertain") {
    return (
      <Alert>
        <AlertTitle>Outcome pending.</AlertTitle>
        <AlertDescription>
          Froggy is checking the saved task. Keep this task while its outcome is
          resolved.
        </AlertDescription>
      </Alert>
    );
  }
  if (task.status === "awaiting_approval") {
    return (
      <Alert>
        <AlertTitle>Waiting for your answer.</AlertTitle>
        <AlertDescription>
          <Link className="underline underline-offset-4" to="/">
            Answer the ticket in Chat
          </Link>{" "}
          and the task continues.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
};

export const ServiceTaskCard = ({
  catalog,
  download,
  task,
}: {
  readonly catalog: readonly ServiceCard[];
  readonly download: (url: string, filename: string) => Promise<void>;
  readonly task: ServiceTicket;
}): ReactElement => {
  const title =
    catalog.find((card) => card.name === task.service)?.title ??
    task.service.replaceAll("_", " ");
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        <TaskStatusBadge status={task.status} />
        {task.stubbed ? (
          <Badge
            className="border-drive-agent/60 text-drive-agent-foreground"
            variant="outline"
          >
            Simulated
          </Badge>
        ) : null}
        {task.saleId !== null && !task.stubbed ? (
          <Badge className="border-brand/40 text-brand" variant="outline">
            Paid on Hedera
          </Badge>
        ) : null}
        <span className="text-money ml-auto text-sm tabular-nums">
          {task.priceCreditUnits === undefined
            ? formatUsd(task.priceUsdMicros)
            : `${formatCredits(task.priceCreditUnits)} ${creditChargeWords(task.chargeStatus)}`}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm break-words">
          {task.prompt}
        </p>
        <Standing task={task} />
        <ServiceTaskResult download={download} task={task} />
      </CardContent>
      <CardFooter>
        <details className="group w-full text-xs">
          <summary className="text-muted-foreground flex min-h-11 cursor-pointer list-none items-center gap-1 select-none">
            Details
            <ChevronDownIcon
              aria-hidden
              className="size-3 group-open:rotate-180"
            />
          </summary>
          <dl className="text-machine grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 pt-2 break-all">
            <dt className="text-muted-foreground">Task</dt>
            <dd>{task.id}</dd>
            {task.saleId === null ? null : (
              <>
                <dt className="text-muted-foreground">Sale</dt>
                <dd>
                  <a
                    className="underline underline-offset-4"
                    href={`/oracle/sales/${task.saleId}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {task.saleId}
                  </a>
                </dd>
              </>
            )}
            {task.upstreamTransactionId === null ? null : (
              <>
                <dt className="text-muted-foreground">Supplier</dt>
                <dd>{task.upstreamTransactionId}</dd>
              </>
            )}
          </dl>
        </details>
      </CardFooter>
    </Card>
  );
};
