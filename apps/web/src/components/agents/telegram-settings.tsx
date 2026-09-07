/** Link Telegram through a short-lived code minted by the signed-in person. */
import { Button } from "@froggy/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";
import { CopyButton } from "../copy-button";

const Status = Schema.Struct({
  paired: Schema.Boolean,
  since: Schema.NullOr(Schema.Int),
});
const Minted = Schema.Struct({
  code: Schema.String,
  expiresAt: Schema.Int,
  link: Schema.NullOr(Schema.String),
});
const decodeStatus = Schema.decodeUnknownSync(Status);
const decodeMinted = Schema.decodeUnknownSync(Minted);

const PairingHint = ({
  minted,
  checking,
  onCheck,
}: {
  readonly minted: typeof Minted.Type;
  readonly checking: boolean;
  readonly onCheck: () => void;
}): ReactElement => {
  const [expired, setExpired] = useState(() => Date.now() >= minted.expiresAt);
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setExpired(true);
      },
      Math.max(0, minted.expiresAt - Date.now())
    );
    return () => {
      clearTimeout(timer);
    };
  }, [minted.expiresAt]);

  if (expired) {
    return (
      <output className="block">
        This code expired. Get a new code to connect.
      </output>
    );
  }
  return (
    <div className="bg-muted space-y-3 rounded-xl p-3">
      <p>Open the bot in Telegram, then tap Start to link your account.</p>
      {minted.link === null ? null : (
        <a
          className="text-primary focus-visible:ring-ring inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          href={minted.link}
          rel="noreferrer"
          target="_blank"
        >
          Open Telegram
        </a>
      )}
      <p className="text-muted-foreground text-xs">
        Or send this command to the bot. Keep it private; it expires in ten
        minutes.
      </p>
      <p className="text-money text-lg break-all select-all">
        /start {minted.code}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <CopyButton
          label="Copy Telegram command"
          text={`/start ${minted.code}`}
        />
        <Button
          className="min-h-11"
          disabled={checking}
          onClick={onCheck}
          size="sm"
          variant="ghost"
        >
          {checking ? "Checking…" : "Check connection"}
        </Button>
      </div>
      <output className="text-muted-foreground block text-xs">
        Waiting for Telegram. This updates when you finish linking.
      </output>
    </div>
  );
};

export const TelegramSettings = ({
  active,
  configured,
}: {
  readonly active: boolean;
  readonly configured: boolean;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };
  const mint = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/telegram", {
        headers: await headers(),
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`telegram: ${response.status}`);
      }
      return decodeMinted(await response.json());
    },
  });
  const status = useQuery({
    enabled: configured && active,
    queryFn: async () => {
      const response = await fetch("/api/telegram", {
        headers: await headers(),
      });
      if (!response.ok) {
        throw new Error(`telegram: ${response.status}`);
      }
      return decodeStatus(await response.json());
    },
    queryKey: ["telegram"],
    refetchInterval: (query) =>
      active &&
      mint.data !== undefined &&
      mint.data.expiresAt > Date.now() &&
      query.state.data?.paired !== true
        ? 2000
        : false,
    retry: false,
  });
  const unpair = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/telegram", {
        headers: await headers(),
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`telegram: ${response.status}`);
      }
      return decodeStatus(await response.json());
    },
    onSuccess: (next) => {
      queries.setQueryData(["telegram"], next);
      mint.reset();
    },
  });

  const paired = status.data?.paired === true;
  const connectionLabel =
    mint.data === undefined ? "Connect Telegram" : "Get a new code";
  return (
    <section
      aria-label="Telegram connection"
      className="space-y-3 rounded-xl border p-4 text-sm"
    >
      <div>
        <h3 className="font-medium">Telegram</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Talk to Froggy and answer its questions from your phone, under the
          same rules as here.
        </p>
      </div>
      {configured ? (
        <>
          {status.isPending ? (
            <output className="block">Checking Telegram connection…</output>
          ) : null}
          {status.isError ? (
            <div className="space-y-2">
              <p className="text-destructive" role="alert">
                Couldn’t check your Telegram connection.
              </p>
              <Button
                className="min-h-11"
                disabled={status.isFetching}
                onClick={() => {
                  void status.refetch();
                }}
                size="sm"
                variant="outline"
              >
                Retry Telegram status
              </Button>
            </div>
          ) : null}
          {status.data === undefined ? null : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <output
                className={paired ? "text-primary" : "text-muted-foreground"}
              >
                {paired ? "Telegram connected." : "Telegram not connected."}
              </output>
              {paired ? (
                <Button
                  className="min-h-11"
                  disabled={unpair.isPending}
                  onClick={() => {
                    unpair.mutate();
                  }}
                  size="sm"
                  variant="outline"
                >
                  {unpair.isPending ? "Disconnecting…" : "Disconnect Telegram"}
                </Button>
              ) : (
                <Button
                  className="min-h-11"
                  disabled={mint.isPending || status.isError}
                  onClick={() => {
                    mint.mutate();
                  }}
                  size="sm"
                  variant="outline"
                >
                  {mint.isPending ? "Creating code…" : connectionLabel}
                </Button>
              )}
            </div>
          )}
          {mint.isError ? (
            <p className="text-destructive" role="alert">
              Couldn’t create a Telegram code. Try again.
            </p>
          ) : null}
          {unpair.isError ? (
            <p className="text-destructive" role="alert">
              Couldn’t confirm the disconnect. Try again.
            </p>
          ) : null}
          {paired || mint.data === undefined ? null : (
            <PairingHint
              key={mint.data.code}
              checking={status.isFetching}
              minted={mint.data}
              onCheck={() => {
                void status.refetch();
              }}
            />
          )}
        </>
      ) : (
        <p className="text-muted-foreground">
          Telegram is not configured on this deployment.
        </p>
      )}
    </section>
  );
};
