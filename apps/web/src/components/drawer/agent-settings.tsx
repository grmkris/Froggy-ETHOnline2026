/**
 * Connect a personal agent: mint a token here, paste the skill there.
 *
 * The secret is shown once, inside the skill text with this server's URL
 * filled in, so connecting Hermes or Claude Code is one paste. After that
 * only the token's name, its dates and a Disconnect button remain: the
 * server keeps the hash, and a disconnected token dies on its next request.
 */

import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import { Textarea } from "@froggy/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Schema } from "effect";
import { useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../../lib/session-token";

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

const when = (at: number | null): string =>
  at === null ? "never" : new Date(at).toLocaleString();

const MintedSkill = ({
  minted,
  onDone,
}: {
  readonly minted: typeof Minted.Type;
  readonly onDone: () => void;
}): ReactElement => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-paper-deep/70 space-y-2 rounded-xl p-3">
      <p className="text-xs">
        Paste this into your agent as its <code>SKILL.md</code>. The token is
        inside it and is shown this once.
      </p>
      <Textarea
        aria-label="Skill for your agent"
        className="text-machine h-40 text-xs"
        readOnly
        value={minted.skill}
      />
      <div className="flex gap-2">
        <Button
          onClick={() => {
            void (async () => {
              await navigator.clipboard.writeText(minted.skill);
              setCopied(true);
            })();
          }}
          size="xs"
        >
          {copied ? "Copied" : "Copy the skill"}
        </Button>
        <Button onClick={onDone} size="xs" variant="ghost">
          I pasted it
        </Button>
      </div>
    </div>
  );
};

export const AgentSettings = (): ReactElement => {
  const { getToken } = useSessionToken();
  const queries = useQueryClient();
  const [label, setLabel] = useState("Hermes");
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };

  const agents = useQuery({
    queryFn: async () => {
      const response = await fetch("/api/agents", { headers: await headers() });
      if (!response.ok) {
        throw new Error(`agents: ${response.status}`);
      }
      return decodeListed(await response.json());
    },
    queryKey: ["agents"],
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
      return decodeMinted(await response.json());
    },
    onSuccess: () => {
      void queries.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/agents/${id}`, {
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
  });

  const live = (agents.data?.agents ?? []).filter((t) => t.revokedAt === null);
  return (
    <div className="space-y-3 text-sm">
      <div>
        Your agents
        <span className="text-muted-foreground block text-xs">
          Hermes, Claude Code, OpenClaw or any agent that can run a command. It
          gets a token that names this workspace, never a key. It can ask for
          tasks and have your wallet pay for them under your rules; it cannot
          approve, raise a cap or add a payee.
        </span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          mint.mutate(label);
        }}
      >
        <Input
          aria-label="A name for the agent"
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          value={label}
        />
        <Button
          disabled={mint.isPending || label.trim() === ""}
          size="sm"
          type="submit"
        >
          Connect
        </Button>
      </form>
      {mint.data === undefined ? null : (
        <MintedSkill
          minted={mint.data}
          onDone={() => {
            mint.reset();
          }}
        />
      )}
      {live.length === 0 ? (
        <p className="text-muted-foreground text-xs">No agent connected yet.</p>
      ) : (
        <ul className="space-y-1">
          {live.map((token) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              key={token.id}
            >
              <span>
                {token.label}
                <span className="text-muted-foreground block text-xs">
                  connected {when(token.createdAt)} · last used{" "}
                  {when(token.lastUsedAt)}
                </span>
              </span>
              <Button
                onClick={() => {
                  revoke.mutate(token.id);
                }}
                size="xs"
                variant="outline"
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
