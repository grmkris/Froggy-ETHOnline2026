/**
 * The connection, as a ticket: the sentence to paste on the body, the
 * machine facts on the stub, and one guide per client beneath.
 *
 * The sentence is printed in full because the person is about to hand it to
 * something they cannot see into; a button that copies invisible text asks
 * for trust the product has no right to. The URL is on the stub because the
 * three clients people actually use want it typed into a form.
 */

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@froggy/ui/components/tabs";
import {
  Ticket,
  TicketBody,
  TicketPerforation,
  TicketStub,
} from "@froggy/ui/components/ticket";
import { useState } from "react";
import type { ReactElement } from "react";

import { useWorkspace } from "../../lib/workspace-context";
import { CopyButton } from "../copy-button";
import { CLIENT_GUIDES } from "./connect-guides";
import type { GuideStep } from "./connect-guides";
import {
  agentOrigin,
  agentPrompt,
  ConnectionStatus,
  CopyAgentPrompt,
} from "./copy-agent-prompt";

/** A screenshot the owner may drop in; absent, the step reads as text alone. */
const GuideImage = ({
  src,
  alt,
}: {
  readonly src: string;
  readonly alt: string;
}): ReactElement | null => {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return null;
  }
  return (
    <img
      alt={alt}
      className="border-border mt-3 w-full max-w-md rounded-xl border"
      loading="lazy"
      onError={() => {
        setMissing(true);
      }}
      src={src}
    />
  );
};

const Step = ({
  guideId,
  index,
  step,
}: {
  readonly guideId: string;
  readonly index: number;
  readonly step: GuideStep;
}): ReactElement => (
  <li className="flex items-start gap-3">
    <span className="text-machine text-muted-foreground mt-1 w-6 shrink-0">
      {String(index + 1).padStart(2, "0")}
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-sm leading-relaxed">{step.text}</p>
      {step.value === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <pre
            className={`text-machine bg-muted shadow-inset min-w-0 flex-1 rounded-lg p-3 select-all ${step.multiline === true ? "whitespace-pre" : "whitespace-pre-wrap"} overflow-x-auto break-all`}
          >
            {step.value}
          </pre>
          <CopyButton label={`Copy step ${index + 1}`} text={step.value} />
        </div>
      )}
      <GuideImage
        alt={`${step.text} (screenshot)`}
        src={`/froggy/connect/${guideId}-${index + 1}.webp`}
      />
    </div>
  </li>
);

export const ConnectTicket = (): ReactElement => {
  const { app } = useWorkspace();
  const origin = agentOrigin(app.mcpUrl);
  const prompt = agentPrompt(origin);
  const mcpUrl = `${origin}/mcp`;
  const [client, setClient] = useState("chatgpt");
  return (
    <section
      aria-label="Connect your agent"
      className="flex min-w-0 flex-col gap-5"
    >
      <Ticket>
        <TicketBody className="flex flex-col gap-3">
          <div>
            <h3 className="text-section">Connect your agent</h3>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Paste this sentence into your agent’s chat. It reads the
              instructions, asks to connect, and you approve access in your
              browser.
            </p>
          </div>
          <p className="text-machine bg-muted shadow-inset rounded-lg p-3 leading-5 wrap-anywhere select-all">
            {prompt}
          </p>
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <CopyAgentPrompt />
            <ConnectionStatus />
          </div>
        </TicketBody>
        <TicketPerforation />
        <TicketStub className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="opacity-60">MCP server</span>
            <span className="text-foreground/80 min-w-0 wrap-anywhere select-all">
              {mcpUrl}
            </span>
            <CopyButton label="Copy the MCP server URL" text={mcpUrl}>
              Copy URL
            </CopyButton>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="opacity-60">Instructions</span>
            <a
              className="text-foreground/80 hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2"
              href={`${origin}/llm.md`}
              rel="noreferrer"
              target="_blank"
            >
              {origin}/llm.md
            </a>
          </div>
        </TicketStub>
      </Ticket>
      <Tabs
        onValueChange={(value: string) => {
          setClient(value);
        }}
        value={client}
      >
        <TabsList
          aria-label="Choose your client"
          className="h-auto w-full flex-wrap justify-start"
          variant="line"
        >
          {CLIENT_GUIDES.map((guide) => (
            <TabsTrigger key={guide.id} value={guide.id}>
              {guide.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {CLIENT_GUIDES.map((guide) => (
          <TabsContent
            className="flex flex-col gap-4 pt-2"
            key={guide.id}
            value={guide.id}
          >
            <p className="text-muted-foreground text-sm">{guide.note}</p>
            <ol className="flex flex-col gap-4">
              {guide.steps(origin).map((step, index) => (
                <Step
                  guideId={guide.id}
                  index={index}
                  key={step.text}
                  step={step}
                />
              ))}
            </ol>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
};
