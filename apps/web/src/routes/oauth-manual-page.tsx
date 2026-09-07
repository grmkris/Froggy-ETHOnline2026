/**
 * The headless fallback: the code, shown to the person to paste.
 *
 * A client with no browser of its own (Hermes in a sandbox, a CLI over
 * SSH) registers this page as its redirect. The same code and PKCE flow
 * lands here instead of on a loopback port, and the person carries the
 * code back by hand. Not RFC 8628: same guarantees, two fewer endpoints.
 */

import { Input } from "@froggy/ui/components/input";
import { useId, useMemo } from "react";
import type { ReactElement } from "react";

import { CopyButton } from "../components/copy-button";

interface ManualOutcome {
  readonly code: string | null;
  readonly error: string | null;
}

const outcomeFromSearch = (search: string): ManualOutcome => {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  return {
    code: params.get("code"),
    error:
      error === null
        ? null
        : (params.get("error_description") ??
          `The request ended with ${error}.`),
  };
};

export const OAuthManualPage = (): ReactElement => {
  const outcome = useMemo(
    () => outcomeFromSearch(globalThis.location.search),
    []
  );
  const inputId = useId();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-5 text-sm">
      {outcome.code === null ? (
        <p className="text-refused" role="alert">
          {outcome.error ?? "No code arrived. Start again from your agent."}
        </p>
      ) : (
        <section
          aria-labelledby={`${inputId}-heading`}
          className="flex flex-col gap-3"
        >
          <h1
            className="font-display text-xl font-semibold tracking-tight"
            id={`${inputId}-heading`}
          >
            Paste this code into your agent
          </h1>
          <p className="text-muted-foreground">
            It works once and expires in ten minutes.
          </p>
          <label className="font-medium" htmlFor={inputId}>
            Authorization code
          </label>
          <Input
            className="text-machine min-h-11"
            id={inputId}
            readOnly
            value={outcome.code}
          />
          <CopyButton label="Copy authorization code" text={outcome.code}>
            Copy code
          </CopyButton>
        </section>
      )}
      <p className="text-muted-foreground text-xs">You can close this tab.</p>
    </main>
  );
};
