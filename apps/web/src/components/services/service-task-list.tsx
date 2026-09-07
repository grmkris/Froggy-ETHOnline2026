/** Every task bought here or by a connected agent, newest first. */

import type { ServiceCard } from "@froggy/protocol";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@froggy/ui/components/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { InboxIcon } from "lucide-react";
import type { ReactElement, RefObject } from "react";

import type { ServiceApi } from "../../hooks/use-service-api";
import { ServiceTaskCard } from "./service-task-card";

export const ServiceTaskList = ({
  catalog,
  download,
  headingRef,
  tasks,
}: {
  readonly catalog: readonly ServiceCard[];
  readonly download: ServiceApi["download"];
  /** Focused after a request starts, so the person lands on the result. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly tasks: ServiceApi["tasks"];
}): ReactElement => (
  <section aria-label="Service tasks" className="flex min-w-0 flex-col gap-3">
    <h2
      className="font-display text-lg font-semibold outline-none"
      ref={headingRef}
      tabIndex={-1}
    >
      Your tasks
    </h2>
    {tasks.isError ? (
      <Alert>
        <AlertTitle>Couldn’t refresh tasks.</AlertTitle>
        <AlertDescription>Your task may still be running.</AlertDescription>
      </Alert>
    ) : null}
    {tasks.isPending ? (
      <output aria-label="Loading tasks" className="flex flex-col gap-2">
        <Skeleton className="h-24 w-full rounded-xl" />
      </output>
    ) : null}
    {tasks.data?.tasks.length === 0 ? (
      <Empty className="flex-none border py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No tasks yet.</EmptyTitle>
          <EmptyDescription>
            Results from you and your connected agents appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : null}
    {tasks.data === undefined || tasks.data.tasks.length === 0 ? null : (
      <ol className="flex flex-col gap-3">
        {tasks.data.tasks.map((task) => (
          <li key={task.id}>
            <ServiceTaskCard
              catalog={catalog}
              download={download}
              task={task}
            />
          </li>
        ))}
      </ol>
    )}
  </section>
);
