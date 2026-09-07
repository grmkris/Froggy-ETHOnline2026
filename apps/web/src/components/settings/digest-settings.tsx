/**
 * The daily digest: an hour, in this browser's zone, or off.
 *
 * The zone is read from the browser rather than asked for, because nobody
 * knows their IANA name and everybody knows what time it is where they are.
 */

import { DigestSchedule } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@froggy/ui/components/field";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useId } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

const decodeSchedule = Schema.decodeUnknownSync(DigestSchedule);

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const label = (hour: number): string =>
  new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });

export const DigestSettings = (): ReactElement => {
  const inputId = useId();
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };

  const schedule = useQuery({
    queryFn: async () => {
      const response = await fetch("/api/digest", { headers: await headers() });
      if (!response.ok) {
        throw new Error(`digest: ${response.status}`);
      }
      return decodeSchedule(await response.json());
    },
    queryKey: ["digest"],
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (next: DigestSchedule) => {
      const response = await fetch("/api/digest", {
        body: JSON.stringify(next),
        headers: { ...(await headers()), "content-type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) {
        throw new Error(`digest: ${response.status}`);
      }
      return decodeSchedule(await response.json());
    },
    onSuccess: (next) => {
      queries.setQueryData(["digest"], next);
    },
  });

  const current = schedule.data?.hour ?? null;
  const hourValue = current === null ? "off" : String(current);
  return (
    <Field data-invalid={save.isError} className="gap-2">
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={inputId}>Daily digest</FieldLabel>
          <FieldDescription id={`${inputId}-help`}>
            An unattended turn, once a day, under the same rules. Nobody can be
            asked, so a spend that needs your answer is refused.
          </FieldDescription>
        </div>
        <select
          aria-label="Daily digest hour"
          aria-describedby={`${inputId}-help`}
          aria-invalid={save.isError}
          id={inputId}
          className="border-input focus-visible:ring-ring min-h-11 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-2"
          disabled={schedule.isPending || schedule.isError || save.isPending}
          onChange={(event) => {
            const hour =
              event.target.value === "off" ? null : Number(event.target.value);
            save.mutate({ hour, timezone });
          }}
          value={schedule.data === undefined ? "unknown" : hourValue}
        >
          {schedule.data === undefined ? (
            <option value="unknown">
              {schedule.isPending ? "Loading…" : "Unavailable"}
            </option>
          ) : null}
          <option value="off">Off</option>
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {label(hour)}
            </option>
          ))}
        </select>
      </div>
      {schedule.isError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-refused text-xs" role="alert">
            Couldn’t load your daily digest.
          </p>
          <Button
            className="min-h-11"
            disabled={schedule.isFetching}
            onClick={() => {
              void schedule.refetch();
            }}
            size="sm"
            variant="outline"
          >
            Retry loading digest
          </Button>
        </div>
      ) : null}
      {save.isError ? (
        <FieldError>Couldn’t save your daily digest. Try again.</FieldError>
      ) : null}
      {current === null ? null : (
        <p className="text-machine text-muted-foreground">{timezone}</p>
      )}
    </Field>
  );
};
