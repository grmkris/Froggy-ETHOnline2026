/**
 * The daily digest: an hour, in this browser's zone, or off.
 *
 * The zone is read from the browser rather than asked for, because nobody
 * knows their IANA name and everybody knows what time it is where they are.
 */

import { DigestSchedule } from "@froggy/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

const decodeSchedule = Schema.decodeUnknownSync(DigestSchedule);

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const label = (hour: number): string =>
  new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });

export const DigestSettings = (): ReactElement => {
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
  return (
    <div className="space-y-1.5 text-sm">
      <label className="grid grid-cols-[1fr_9rem] items-center gap-3">
        <span>
          Daily digest
          <span className="text-muted-foreground block text-xs">
            An unattended turn, once a day, under the same mandate. Nobody can
            be asked, so anything over the threshold is refused.
          </span>
        </span>
        <select
          aria-label="Daily digest hour"
          className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
          disabled={schedule.isPending || save.isPending}
          onChange={(event) => {
            const hour =
              event.target.value === "off" ? null : Number(event.target.value);
            save.mutate({ hour, timezone });
          }}
          value={current === null ? "off" : String(current)}
        >
          <option value="off">Off</option>
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>
              {label(hour)}
            </option>
          ))}
        </select>
      </label>
      {current === null ? null : (
        <p className="text-machine text-muted-foreground">
          {timezone}
          {save.isError ? " · could not save" : ""}
        </p>
      )}
    </div>
  );
};
