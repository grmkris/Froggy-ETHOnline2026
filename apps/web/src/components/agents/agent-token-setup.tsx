/**
 * The token path: a name, a connection, and the skill shown once.
 *
 * Kept for agents that cannot open a browser. The skill stays in memory
 * until the person says they pasted it; the server keeps only a hash.
 */

import { Button } from "@froggy/ui/components/button";
import { Input } from "@froggy/ui/components/input";
import { Textarea } from "@froggy/ui/components/textarea";
import { useId, useState } from "react";
import type { ReactElement } from "react";

import type { useAgentTokens } from "../../hooks/use-agent-tokens";
import { setMintedSkill, useMintedSkill } from "../../lib/minted-skill-store";
import { CopyButton } from "../copy-button";

const MintedSkill = ({
  onDone,
  skill,
}: {
  readonly onDone: () => void;
  readonly skill: string;
}): ReactElement => (
  <section
    aria-label="Finish connecting your agent"
    className="bg-muted/60 flex flex-col gap-3 rounded-xl border p-4"
  >
    <div>
      <h3 className="font-medium">Give your agent its connection</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Paste this into your agent as its <code>SKILL.md</code>. The connection
        token is included and shown only here.
      </p>
    </div>
    <Textarea
      aria-label="Skill for your agent"
      className="text-machine h-40 text-xs"
      readOnly
      value={skill}
    />
    <div className="flex flex-wrap items-start gap-2">
      <CopyButton label="Copy agent skill" text={skill}>
        Copy skill
      </CopyButton>
      <Button className="min-h-11" onClick={onDone} size="sm" variant="ghost">
        I pasted it
      </Button>
    </div>
    <p className="text-muted-foreground text-xs">
      You can leave this page and come back to it. Reloading clears this copy;
      if you haven’t saved it, disconnect this connection and create another.
    </p>
  </section>
);

export const AgentTokenSetup = ({
  mint,
}: Pick<ReturnType<typeof useAgentTokens>, "mint">): ReactElement => {
  const inputId = useId();
  const [label, setLabel] = useState("Hermes");
  const skill = useMintedSkill();
  const canCreate = !mint.isPending && label.trim() !== "" && skill === null;
  const createLabel = mint.isError ? "Retry connection" : "Create connection";
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted-foreground">
        For an agent that cannot open a browser to sign in. The skill it gets
        carries a token you can disconnect below at any time.
      </p>
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
      {skill === null ? null : (
        <MintedSkill
          onDone={() => {
            setMintedSkill(null);
            mint.reset();
          }}
          skill={skill}
        />
      )}
    </div>
  );
};
