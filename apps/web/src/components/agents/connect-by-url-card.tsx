/**
 * Connect by URL: the agent signs in with the person's Froggy account in the
 * browser, and no token changes hands.
 *
 * Loud when it cannot happen: until this deployment answers MCP clients at
 * `/mcp`, the card says so and copies nothing, rather than advertising an
 * endpoint that would refuse them.
 */

import { Badge } from "@froggy/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@froggy/ui/components/card";
import { Input } from "@froggy/ui/components/input";
import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";

import {
  claudeCodeCommand,
  cursorConfig,
  hermesNote,
} from "../../lib/mcp-instructions";
import { CopyButton } from "../copy-button";

const Steps = ({
  children,
  title,
}: {
  readonly children: ReactElement;
  readonly title: string;
}): ReactElement => (
  <details className="group rounded-xl border px-3">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium select-none">
      {title}
      <ChevronDownIcon aria-hidden className="size-4 group-open:rotate-180" />
    </summary>
    <div className="pb-3 text-sm">{children}</div>
  </details>
);

export const ConnectByUrlCard = ({
  mcpUrl,
}: {
  readonly mcpUrl: string | null;
}): ReactElement => (
  <Card>
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2">
        Connect by URL
        {mcpUrl === null ? (
          <Badge
            className="border-drive-agent/60 text-drive-agent"
            variant="outline"
          >
            Not on this deployment yet
          </Badge>
        ) : null}
      </CardTitle>
      <CardDescription>
        Your agent signs in with your Froggy account in the browser; there is no
        token to paste. Disconnect it here whenever you like.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="MCP URL"
          className="text-machine min-h-11 min-w-0 flex-1 select-all"
          readOnly
          value={mcpUrl ?? "Not available on this deployment"}
        />
        {mcpUrl === null ? null : (
          <CopyButton label="Copy MCP URL" text={mcpUrl} />
        )}
      </div>
      {mcpUrl === null ? null : (
        <div className="flex flex-col gap-2">
          <Steps title="Claude Code">
            <pre className="text-machine overflow-x-auto text-xs whitespace-pre-wrap">
              {claudeCodeCommand(mcpUrl)}
            </pre>
          </Steps>
          <Steps title="Cursor">
            <pre className="text-machine overflow-x-auto text-xs whitespace-pre-wrap">
              {cursorConfig(mcpUrl)}
            </pre>
          </Steps>
          <Steps title="Hermes">
            <p>{hermesNote(mcpUrl)}</p>
          </Steps>
        </div>
      )}
    </CardContent>
  </Card>
);
