import { Schedule } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@froggy/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { BellPlusIcon } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";
import { useWorkspace } from "../../lib/workspace-context";

export const ReminderForm = (): ReactElement => {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { getToken, canConnect } = useSessionToken();
  const { app } = useWorkspace();
  const queries = useQueryClient();
  const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const create = useMutation({
    mutationFn: async (data: FormData) => {
      const token = await getToken();
      const response = await fetch("/api/schedules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          v: 1,
          label: data.get("label"),
          action: { _tag: "remind", text: data.get("label") },
          timezone,
          when: { _tag: "at", local: data.get("when") },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const decoded = Schema.decodeUnknownResult(
          Schema.Struct({ error: Schema.String })
        )(body);
        throw new Error(
          decoded._tag === "Success"
            ? decoded.success.error
            : "Reminder could not be created."
        );
      }
      return Schema.decodeUnknownSync(Schedule)(body);
    },
    onSuccess: async (schedule) => {
      setConfirmation(
        `Reminder set for ${schedule.nextRunAt === null ? "your chosen time" : new Date(schedule.nextRunAt).toLocaleString()}.`
      );
      await queries.invalidateQueries({
        queryKey: ["schedules", app.sessionId],
      });
      setOpen(false);
    },
    retry: false,
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          create.reset();
        }}
      >
        <DialogTrigger render={<Button variant="outline" />}>
          <BellPlusIcon data-icon="inline-start" />
          Reminder
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A little nudge, later</DialogTitle>
            <DialogDescription>
              Froggy will remind you here and on Telegram when connected.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(new FormData(event.currentTarget));
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="reminder-label">Remind me to…</FieldLabel>
                <Input
                  id="reminder-label"
                  maxLength={80}
                  name="label"
                  placeholder="Check those flights"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="reminder-when">When</FieldLabel>
                <Input
                  id="reminder-when"
                  name="when"
                  required
                  type="datetime-local"
                />
                <FieldDescription>{timezone}</FieldDescription>
              </Field>
            </FieldGroup>
            {create.isError ? (
              <p className="text-destructive text-sm" role="alert">
                {create.error.message}
              </p>
            ) : null}
            <Button
              disabled={
                create.isPending || !canConnect || app.sessionId === null
              }
              type="submit"
            >
              {create.isPending ? "Scheduling…" : "Set reminder"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {confirmation === null ? null : (
        <output className="saved-feedback text-brand max-w-64 text-xs">
          {confirmation}
        </output>
      )}
    </div>
  );
};
