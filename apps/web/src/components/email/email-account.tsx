import { Badge } from "@froggy/ui/components/badge";
import { Button } from "@froggy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@froggy/ui/components/field";
import { Input } from "@froggy/ui/components/input";
import { Link } from "@tanstack/react-router";
import type { Schema } from "effect";
import { useState } from "react";

import { useEmailClient, useEmailStatus } from "../../lib/email-client";

export const EmailHomeLink = () => {
  const status = useEmailStatus();
  const box = status.data?.mailbox;
  if (!box) {
    return null;
  }
  return (
    <Link
      className="text-muted-foreground hover:text-foreground flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
      to="/chat/$conversationId"
      params={{ conversationId: box.conversationId }}
    >
      <span>Email · {status.data?.address}</span>
      <span>
        {(status.data?.unread ?? 0) > 0
          ? `${status.data?.unread ?? 0} unread`
          : "Open"}
      </span>
    </Link>
  );
};
export const EmailAccount = () => {
  const status = useEmailStatus();
  const client = useEmailClient();
  const [handle, setHandle] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const act = async (path: string, body: Schema.Json | undefined) => {
    setFailure(null);
    setPending(true);
    try {
      await client.change(path, body);
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Email could not be updated."
      );
    }
    setPending(false);
  };
  const { data } = status;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Froggy email</CardTitle>
        <CardDescription>
          An address for the work you give Froggy. Incoming mail stays in your
          conversations; you review every message before it sends.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data?.stubbed === true ? (
          <Badge variant="secondary">Demo email · no real delivery</Badge>
        ) : null}
        {data?.mailbox ? (
          <>
            <p className="font-mono text-sm break-all">{data.address}</p>
            <p className="text-muted-foreground text-sm">
              {(data.mailbox.usedBytes / (1024 * 1024)).toFixed(1)} MiB of{" "}
              {data.storageLimit / 1024 ** 3} GiB · up to {data.dailyLimit}{" "}
              recipient deliveries daily. Kept until you delete it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(data.address ?? "");
                    } catch {
                      setFailure("Could not copy the address.");
                    }
                  })();
                }}
              >
                Copy address
              </Button>
              <Button
                disabled={pending}
                variant="outline"
                onClick={() => {
                  void act(
                    data.mailbox?.active === true ? "disable" : "claim",
                    {
                      v: 1,
                      handle: data.mailbox?.handle ?? "",
                    }
                  );
                }}
              >
                {data.mailbox.active ? "Disable email" : "Enable email"}
              </Button>
            </div>
            <EmailHomeLink />
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act("claim", { v: 1, handle });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email-handle">
                  Choose your permanent address
                </FieldLabel>
                <Input
                  id="email-handle"
                  value={handle}
                  onChange={(event) => {
                    setHandle(event.target.value.toLowerCase());
                  }}
                  placeholder="your-name"
                  pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                  minLength={3}
                  maxLength={32}
                  required
                  autoComplete="off"
                />
                <FieldDescription>
                  3–32 letters, numbers, or hyphens. Your address cannot be
                  transferred to another user.
                </FieldDescription>
              </Field>
              <Button disabled={pending || status.isError} type="submit">
                Claim address
              </Button>
            </FieldGroup>
          </form>
        )}
        {failure !== null || status.error !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {failure ?? status.error?.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
