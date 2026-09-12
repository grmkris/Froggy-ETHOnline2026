/**
 * The consent page: an MCP client wants to use this person's wallet.
 *
 * The client sent the person here with the authorization request in the
 * query. The page names the client, says where it returns to, and lets the
 * person leave scopes on or off before Allow or Deny. The decision goes to
 * the server as a POST under the person's own token; the server does every
 * check and answers with the redirect, which the page follows. Nothing is
 * validated here twice, and nothing is redirected to that the server did
 * not vet first.
 */

import { OAUTH_SCOPES } from "@froggy/domain";
import type { OAuthScope } from "@froggy/domain";
import { Button } from "@froggy/ui/components/button";
import { Switch } from "@froggy/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { useId, useMemo, useState } from "react";
import type { ReactElement } from "react";

import { useSessionToken } from "../lib/session-token";

interface ScopeCopy {
  readonly detail: string;
  readonly title: string;
}

const SCOPE_COPY: ReadonlyMap<OAuthScope, ScopeCopy> = new Map([
  [
    "email:read",
    {
      title: "Read your whole email mailbox",
      detail:
        "Read and search all Froggy email messages and supported attachments.",
    },
  ],
  [
    "email:draft",
    {
      title: "Prepare email drafts",
      detail:
        "Create documents and drafts. Only you can approve sending in Froggy.",
    },
  ],
  [
    "history",
    {
      title: "Read this connection’s activity",
      detail:
        "Inspect its recorded calls and results. Your private web and Telegram chats stay private.",
    },
  ],
  [
    "brief",
    { detail: "$0.05 each, from The Graph.", title: "Buy lending briefs" },
  ],
  [
    "browse",
    {
      detail: "$0.50 per task, up to forty steps.",
      title: "Browse on your shared Chrome",
    },
  ],
  [
    "pay",
    {
      detail: "Pay a 402 from your wallet for a task the agent brings.",
      title: "Sign x402 payments",
    },
  ],
  [
    "services",
    {
      detail: "Search, images, inference and speech at fixed prices.",
      title: "Buy services",
    },
  ],
]);

const Client = Schema.Struct({
  client: Schema.Struct({ name: Schema.String }),
});
const Outcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literals(["redirect"]), url: Schema.String }),
  Schema.Struct({ kind: Schema.Literals(["refused"]), reason: Schema.String }),
]);
const decodeClient = Schema.decodeUnknownSync(Client);
const decodeOutcome = Schema.decodeUnknownSync(Outcome);

/**
 * The authorization request, as the query carried it. Relayed to the server
 * as is; an absent parameter is dropped by JSON on the way.
 */
interface AuthorizeRequest {
  readonly client_id: string;
  readonly code_challenge: string | undefined;
  readonly code_challenge_method: string | undefined;
  readonly redirect_uri: string;
  readonly resource: string | undefined;
  readonly response_type: string | undefined;
  readonly scope: string | undefined;
  readonly state: string | undefined;
}

const optional = (params: URLSearchParams, key: string): string | undefined =>
  params.get(key) ?? undefined;

const requestFromSearch = (search: string): AuthorizeRequest | null => {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  if (clientId === null || redirectUri === null) {
    return null;
  }
  return {
    client_id: clientId,
    code_challenge: optional(params, "code_challenge"),
    code_challenge_method: optional(params, "code_challenge_method"),
    redirect_uri: redirectUri,
    resource: optional(params, "resource"),
    response_type: optional(params, "response_type"),
    scope: optional(params, "scope"),
    state: optional(params, "state"),
  };
};

/** The scopes the client asked for, in the page's order; all of them when it named none. */
const requestedScopes = (scope: string | undefined): readonly OAuthScope[] => {
  if (scope === undefined || scope.trim() === "") {
    return OAUTH_SCOPES.filter((candidate) => !candidate.startsWith("email:"));
  }
  const names = new Set(scope.split(" "));
  return OAUTH_SCOPES.filter((known) => names.has(known));
};

const returnHost = (redirectUri: string): string => {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
};

const ScopeSwitch = ({
  checked,
  onChange,
  scope,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly scope: OAuthScope;
}): ReactElement => {
  const titleId = useId();
  const detailId = useId();
  const copy = SCOPE_COPY.get(scope);
  return (
    <li className="flex min-h-11 items-center justify-between gap-4 rounded-xl border p-3">
      <div className="min-w-0">
        <p className="font-medium" id={titleId}>
          {copy?.title ?? scope}
        </p>
        <p className="text-muted-foreground text-xs" id={detailId}>
          {copy?.detail ?? ""}
        </p>
      </div>
      <Switch
        aria-describedby={detailId}
        aria-labelledby={titleId}
        checked={checked}
        onCheckedChange={onChange}
      />
    </li>
  );
};

const Consent = ({
  request,
}: {
  readonly request: AuthorizeRequest;
}): ReactElement => {
  const { getToken } = useSessionToken();
  const requested = useMemo(
    () => requestedScopes(request.scope),
    [request.scope]
  );
  const [granted, setGranted] = useState<ReadonlySet<OAuthScope>>(
    () => new Set(requested)
  );
  const headers = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token === null ? {} : { authorization: `Bearer ${token}` };
  };
  const client = useQuery({
    queryFn: async () => {
      const response = await fetch(
        `/api/oauth/client/${encodeURIComponent(request.client_id)}`,
        { headers: await headers() }
      );
      if (!response.ok) {
        throw new Error(`client: ${response.status}`);
      }
      return decodeClient(await response.json()).client;
    },
    queryKey: ["oauth-client", request.client_id],
    retry: false,
  });
  const decide = useMutation({
    mutationFn: async (decision: "allow" | "deny") => {
      const response = await fetch("/api/oauth/consent", {
        body: JSON.stringify({
          decision,
          granted: [...granted],
          params: request,
          v: 1,
        }),
        headers: { "content-type": "application/json", ...(await headers()) },
        method: "POST",
      });
      const outcome = decodeOutcome(await response.json());
      if (outcome.kind === "refused") {
        throw new Error(outcome.reason);
      }
      globalThis.location.assign(outcome.url);
    },
    retry: false,
  });
  const name = client.data?.name ?? "An agent";
  const busy = decide.isPending || decide.isSuccess;
  return (
    <section
      aria-labelledby="consent-heading"
      className="flex flex-col gap-5 text-sm"
    >
      <div>
        <h1
          className="font-display text-xl font-semibold tracking-tight"
          id="consent-heading"
        >
          {client.isPending
            ? "Loading…"
            : `${name} wants to use your Froggy wallet`}
        </h1>
        <p className="text-muted-foreground mt-2">
          It returns to{" "}
          <span className="text-machine">
            {returnHost(request.redirect_uri)}
          </span>{" "}
          once you decide.
        </p>
      </div>
      {client.isError ? (
        <p className="text-refused text-xs" role="alert">
          Froggy doesn’t know this client. Nothing was shared; close this tab
          and start again from your agent.
        </p>
      ) : null}
      <ul aria-label="What it may do" className="flex flex-col gap-2">
        {requested.map((scope) => (
          <ScopeSwitch
            checked={granted.has(scope)}
            key={scope}
            onChange={(checked) => {
              setGranted((current) => {
                const next = new Set(current);
                if (checked) {
                  next.add(scope);
                } else {
                  next.delete(scope);
                }
                return next;
              });
            }}
            scope={scope}
          />
        ))}
      </ul>
      <p className="text-muted-foreground">
        Your spending rules still apply. Disconnect any time on Connections.
      </p>
      {decide.isError ? (
        <p className="text-refused text-xs" role="alert">
          {decide.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={busy || client.isError}
          onClick={() => {
            decide.mutate("allow");
          }}
        >
          {decide.isPending ? "Allowing…" : "Allow"}
        </Button>
        <Button
          className="min-h-11"
          disabled={busy || client.isError}
          onClick={() => {
            decide.mutate("deny");
          }}
          variant="outline"
        >
          Deny
        </Button>
      </div>
    </section>
  );
};

export const OAuthAuthorizePage = (): ReactElement => {
  const request = useMemo(
    () => requestFromSearch(globalThis.location.search),
    []
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-5">
      {request === null ? (
        <p className="text-refused" role="alert">
          This link is missing the client or where to return to. Start again
          from your agent.
        </p>
      ) : (
        <Consent request={request} />
      )}
    </main>
  );
};
