/**
 * Pair a Telegram account: mint a code here, send it there.
 *
 * The code is the only credential in the exchange. It is minted while signed
 * in, it lives ten minutes, and it is spent the moment the bot sees it, so a
 * screenshot of this drawer is not a way into someone's wallet.
 */

import { Button } from "@froggy/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

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
  onSent,
}: {
  readonly minted: typeof Minted.Type | null;
  readonly onSent: () => void;
}): ReactElement | null =>
  minted === null ? null : (
    <div className="bg-paper-deep/70 space-y-1 rounded-xl p-3">
      <p className="text-xs">Send this to the bot within ten minutes:</p>
      <p className="text-money text-2xl tracking-[0.2em]">{minted.code}</p>
      {minted.link === null ? (
        <p className="text-machine">/start {minted.code}</p>
      ) : (
        <a
          className="text-brand text-xs underline"
          href={minted.link}
          rel="noreferrer"
          target="_blank"
        >
          Open Telegram with the code filled in
        </a>
      )}
      <Button onClick={onSent} size="xs" variant="ghost">
        I sent it
      </Button>
    </div>
  );

export const TelegramSettings = ({
  configured,
}: {
  readonly configured: boolean;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };

  const status = useQuery({
    enabled: configured,
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
  });

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

  if (!configured) {
    return (
      <p className="text-muted-foreground text-sm">
        Telegram is not configured on this deployment.
      </p>
    );
  }

  const paired = status.data?.paired === true;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span>
          Telegram
          <span className="text-muted-foreground block text-xs">
            Your digest, approval questions with buttons, a freeze button, and a
            way to talk to the agent from your phone.
          </span>
        </span>
        {paired ? (
          <Button
            onClick={() => {
              unpair.mutate();
            }}
            size="sm"
            variant="outline"
          >
            Unpair
          </Button>
        ) : (
          <Button
            disabled={mint.isPending}
            onClick={() => {
              mint.mutate();
            }}
            size="sm"
          >
            Pair
          </Button>
        )}
      </div>
      {paired ? (
        <p className="text-brand text-xs">Paired.</p>
      ) : (
        <PairingHint
          minted={mint.data ?? null}
          onSent={() => {
            void status.refetch();
          }}
        />
      )}
    </div>
  );
};
