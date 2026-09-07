/**
 * A minted skill stays in this mounted setup surface until acknowledged.
 * Keep it in memory: the server only retains a hash of the credential.
 */

import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import { Skeleton } from "@froggy/ui/components/skeleton";
import { Textarea } from "@froggy/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";
import { CopyButton } from "../copy-button";

const Token = Schema.Struct({
  createdAt: Schema.Int,
  id: Schema.String,
  label: Schema.String,
  lastUsedAt: Schema.NullOr(Schema.Int),
  revokedAt: Schema.NullOr(Schema.Int),
});
const Listed = Schema.Struct({ agents: Schema.Array(Token) });
const Minted = Schema.Struct({
  secret: Schema.String,
  skill: Schema.String,
  token: Token,
});
const decodeListed = Schema.decodeUnknownSync(Listed);
const decodeMinted = Schema.decodeUnknownSync(Minted);

const when = (at: number): string => new Date(at).toLocaleString();

const MintedSkill = ({
  onDone,
  secret,
  skill,
}: {
  readonly onDone: () => void;
  readonly secret: string;
  readonly skill: string;
}): ReactElement => (
  <section
    aria-label="Finish connecting your agent"
    className="bg-muted/60 flex flex-col gap-3 rounded-xl border p-4"
  >
    <div>
      <h3 className="font-medium">Give your agent its connection</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Set the token as <code>FROGGY_TOKEN</code> in your agent, and paste the
        skill as its <code>SKILL.md</code>. The token is shown only here.
      </p>
    </div>
    <Input
      aria-label="Connection token"
      className="text-machine min-h-11 text-xs"
      readOnly
      value={secret}
    />
    <Textarea
      aria-label="Skill for your agent"
      className="text-machine h-40 text-xs"
      readOnly
      value={skill}
    />
    <div className="flex flex-wrap items-start gap-2">
      <CopyButton label="Copy connection token" text={secret}>
        Copy token
      </CopyButton>
      <CopyButton label="Copy agent skill" text={skill}>
        Copy skill
      </CopyButton>
      <Button className="min-h-11" onClick={onDone} size="sm" variant="ghost">
        I pasted it
      </Button>
    </div>
    <p className="text-muted-foreground text-xs">
      You can close this panel and return to it. Reloading the page clears this
      copy; if you haven’t saved it, disconnect this connection and create
      another.
    </p>
  </section>
);

const AgentConnection = ({
  headers,
  token,
}: {
  readonly headers: () => Promise<Record<string, string>>;
  readonly token: typeof Token.Type;
}): ReactElement => {
  const queries = useQueryClient();
  const revoke = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/agents/${token.id}`, {
        headers: await headers(),
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["agents"] });
    },
    retry: false,
  });

  const disconnectLabel = revoke.isError ? "Retry" : "Disconnect";
  return (
    <li className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium wrap-anywhere">{token.label}</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {token.lastUsedAt === null ? "Waiting for first use" : "Connected"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {token.lastUsedAt === null
              ? `Created ${when(token.createdAt)}`
              : `Last used ${when(token.lastUsedAt)}`}
          </p>
        </div>
        <Button
          aria-label={`${revoke.isError ? "Retry disconnecting" : "Disconnect"} ${token.label}`}
          className="min-h-11"
          disabled={revoke.isPending}
          onClick={() => {
            revoke.mutate();
          }}
          size="sm"
          variant="outline"
        >
          {revoke.isPending ? "Disconnecting…" : disconnectLabel}
        </Button>
      </div>
      {revoke.isError ? (
        <p className="text-refused text-xs" role="alert">
          Couldn’t confirm the disconnect. Try again or refresh status.
        </p>
      ) : null}
    </li>
  );
};

export const AgentSettings = ({
  active = true,
}: {
  readonly active?: boolean;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const inputId = useId();
  const [label, setLabel] = useState("Hermes");
  const [minted, setMinted] = useState<typeof Minted.Type>();
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };

  const agents = useQuery({
    enabled: active,
    queryFn: async () => {
      const response = await fetch("/api/agents", { headers: await headers() });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      return decodeListed(await response.json());
    },
    queryKey: ["agents"],
    refetchOnWindowFocus: active ? "always" : false,
    retry: false,
  });

  const mint = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch("/api/agents", {
        body: JSON.stringify({ label: name }),
        headers: { "content-type": "application/json", ...(await headers()) },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      // Keep the one-time token in the mounted host, out of the query cache.
      setMinted(decodeMinted(await response.json()));
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["agents"] });
    },
    retry: false,
  });

  const live = agents.data?.agents.filter((token) => token.revokedAt === null);
  const canCreate =
    !mint.isPending && label.trim() !== "" && minted === undefined;
  const createLabel = mint.isError ? "Retry connection" : "Create connection";
  const refreshLabel = agents.isError
    ? "Retry loading agents"
    : "Refresh status";
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Connect an agent
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Give Hermes, Claude Code or another agent a way to request tasks. Your
          spending limits still apply, and you can disconnect it here.
        </p>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canCreate) {
            mint.mutate(label.trim());
          }
        }}
      >
        <label className="font-medium" htmlFor={inputId}>
          Agent name
        </label>
        <div className="flex gap-2">
          <Input
            className="min-h-11 min-w-0"
            id={inputId}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            value={label}
          />
          <Button
            className="min-h-11"
            disabled={!canCreate}
            size="sm"
            type="submit"
          >
            {mint.isPending ? "Creating…" : createLabel}
          </Button>
        </div>
        {mint.isError ? (
          <p className="text-refused text-xs" role="alert">
            Couldn’t create the connection. Try again, or refresh status to
            check whether it was created.
          </p>
        ) : null}
      </form>
      {minted === undefined ? null : (
        <MintedSkill
          onDone={() => {
            setMinted(undefined);
            mint.reset();
          }}
          secret={minted.secret}
          skill={minted.skill}
        />
      )}
      <section aria-label="Your agents" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Your agents</h3>
          <Button
            className="min-h-11"
            disabled={agents.isFetching}
            onClick={() => {
              void agents.refetch();
            }}
            size="sm"
            variant="ghost"
          >
            {agents.isFetching ? "Refreshing…" : refreshLabel}
          </Button>
        </div>
        {agents.isPending ? (
          <output aria-label="Loading agents" className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <span className="sr-only">Loading agents</span>
          </output>
        ) : null}
        {agents.isError ? (
          <p className="text-refused text-xs" role="alert">
            Couldn’t load your agents. Retry to see their latest status.
          </p>
        ) : null}
        {live?.length === 0 && !agents.isError ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4">
            No connections yet. Create one above, or use Froggy in this
            workspace.
          </p>
        ) : null}
        {live === undefined || live.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {live.map((token) => (
              <AgentConnection headers={headers} key={token.id} token={token} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
