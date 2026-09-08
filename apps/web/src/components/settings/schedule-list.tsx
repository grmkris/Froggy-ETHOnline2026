/** What Froggy will do later, and the one button that cancels each. */

import { ScheduleList as ScheduleListSchema } from "@froggy/protocol";
import { Button } from "@froggy/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@froggy/ui/components/empty";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";

import {
  actionWords,
  cadenceWords,
  nextRunWords,
} from "../../lib/schedule-words";
import { useSessionToken } from "../../lib/session-token";

const decodeList = Schema.decodeUnknownSync(ScheduleListSchema);

export const ScheduleList = (): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };
  const schedules = useQuery({
    queryFn: async () => {
      const response = await fetch("/api/schedules", {
        headers: await headers(),
      });
      if (!response.ok) {
        throw new Error(`schedules: ${response.status}`);
      }
      return decodeList(await response.json());
    },
    queryKey: ["schedules"],
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/schedules/${id}`, {
        headers: await headers(),
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`schedules: ${response.status}`);
      }
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["schedules"] });
    },
    retry: false,
  });
  const active =
    schedules.data?.schedules.filter(
      (schedule) => schedule.status === "active"
    ) ?? [];
  return (
    <section aria-label="Scheduled" className="flex flex-col gap-3 text-sm">
      <h3 className="font-medium">Scheduled</h3>
      {schedules.isPending ? (
        <output aria-label="Loading schedules">
          <Skeleton className="h-16 w-full rounded-xl" />
        </output>
      ) : null}
      {schedules.isError ? (
        <p className="text-refused text-xs" role="alert">
          Couldn’t load what is scheduled.
        </p>
      ) : null}
      {schedules.data !== undefined && active.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing scheduled.</EmptyTitle>
            <EmptyDescription>
              Ask Froggy in the chat: “remind me in 20 minutes to…” or “every
              morning at 7:30, check…”.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {active.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {active.map((schedule) => (
            <li
              className="bg-muted shadow-inset flex items-start justify-between gap-3 rounded-lg p-3"
              key={schedule.id}
            >
              <div className="min-w-0">
                <p className="font-medium wrap-anywhere">{schedule.label}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {cadenceWords(schedule.cadence)} · next{" "}
                  {nextRunWords(schedule)}
                </p>
                <p className="text-muted-foreground mt-1 text-xs wrap-anywhere">
                  {actionWords(schedule.action)}
                </p>
              </div>
              <Button
                aria-label={`Cancel ${schedule.label}`}
                className="min-h-11"
                disabled={cancel.isPending}
                onClick={() => {
                  cancel.mutate(schedule.id);
                }}
                size="sm"
                variant="outline"
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      )}
      {cancel.isError ? (
        <p className="text-refused text-xs" role="alert">
          Couldn’t cancel it. Try again.
        </p>
      ) : null}
    </section>
  );
};
