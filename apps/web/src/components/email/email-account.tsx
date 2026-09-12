import type { EmailStatus } from "@froggy/protocol";
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
    return status.data ? (
      <Link
        className="text-muted-foreground hover:text-foreground flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm"
        to="/settings"
      >
        <span className="text-foreground font-medium">
          Claim your Froggy email
        </span>
        <span>
          Receive sign-up codes and confirmations. Set it up in Account.
        </span>
      </Link>
    ) : null;
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
const ClaimedEmail = ({
  data,
  pending,
  onToggle,
  onError,
  setup,
}: {
  readonly data: typeof EmailStatus.Type;
  readonly pending: boolean;
  readonly onToggle: () => void;
  readonly onError: (message: string) => void;
  readonly setup: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  if (!data.mailbox) {
    return null;
  }
  let readyLabel = data.mailbox.active ? "Address ready" : "Email is disabled";
  if (data.stubbed) {
    readyLabel = "Demo address ready";
  }
  return (
    <>
      <output className="text-brand text-sm font-medium">{readyLabel}</output>
      <p className="font-mono text-sm break-all">{data.address}</p>
      <p className="text-muted-foreground text-sm">
        {(data.mailbox.usedBytes / (1024 * 1024)).toFixed(1)} MiB of{" "}
        {data.storageLimit / 1024 ** 3} GiB · up to {data.dailyLimit} recipient
        deliveries daily. Kept until you delete it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(data.address ?? "");
                setCopied(true);
              } catch {
                onError("Could not copy the address.");
              }
            })();
          }}
        >
          {copied ? "Copied" : "Copy address"}
        </Button>
        {setup && data.mailbox.active ? null : (
          <Button disabled={pending} variant="outline" onClick={onToggle}>
            {data.mailbox.active ? "Disable email" : "Enable email"}
          </Button>
        )}
      </div>
      {setup ? null : <EmailHomeLink />}
    </>
  );
};

export const EmailAccount = ({
  onContinue,
  onBack,
}: {
  readonly onContinue?: () => void;
  readonly onBack?: () => void;
}) => {
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
          Choose once. Use it whenever Froggy needs an email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data?.stubbed === true ? (
          <Badge variant="secondary">Demo email · no real delivery</Badge>
        ) : null}
        {data?.mailbox ? (
          <ClaimedEmail
            data={data}
            pending={pending}
            setup={onContinue !== undefined}
            onError={setFailure}
            onToggle={() => {
              void act(data.mailbox?.active === true ? "disable" : "claim", {
                v: 1,
                handle: data.mailbox?.handle ?? "",
              });
            }}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act("claim", { v: 1, handle });
            }}
          >
            <FieldGroup>
              <Field data-invalid={failure !== null}>
                <FieldLabel htmlFor="email-handle">
                  Choose your permanent address
                </FieldLabel>
                <Input
                  id="email-handle"
                  value={handle}
                  disabled={pending || !data}
                  aria-describedby="email-handle-help email-address-preview"
                  aria-invalid={failure !== null}
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
                <output
                  id="email-address-preview"
                  className="text-foreground font-mono text-lg break-all"
                  aria-label="Your email address preview"
                >
                  {data
                    ? `${handle || "your-name"}@${data.domain}`
                    : "Loading your email domain…"}
                </output>
                <FieldDescription id="email-handle-help">
                  3–32 letters, numbers, or hyphens; start and end with a letter
                  or number. Choose carefully: your handle is permanent and
                  cannot be changed or transferred. Enter just your name,
                  without the @domain.
                </FieldDescription>
              </Field>
              <Button
                disabled={pending || !data || status.isError}
                type="submit"
              >
                {pending ? "Claiming…" : "Claim address"}
              </Button>
            </FieldGroup>
          </form>
        )}
        {failure !== null || status.error !== null ? (
          <p role="alert" className="text-destructive text-sm">
            {failure ?? status.error?.message}
          </p>
        ) : null}
        {onContinue ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={onBack}
            >
              Back
            </Button>
            <Button
              variant={data?.mailbox ? "default" : "ghost"}
              className="min-h-11"
              disabled={pending}
              onClick={onContinue}
            >
              {data?.mailbox ? "Continue" : "Do this later"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
