/**
 * Step one: which door, and what a person is dealing with.
 *
 * The door only decides the last screen of setup — Home looks the same
 * either way, and whether someone "has an assistant" is read from
 * Connections, not from what they clicked on day one. The four lines under
 * "Before you start" are the AI notice; Continue is the acknowledgement,
 * and nothing is signed or stored for it.
 */

import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { cn } from "@froggy/ui/lib/utils";
import {
  BotIcon,
  DatabaseIcon,
  MonitorIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { StepActions, StepHeading } from "./frame";

export type Door = "here" | "assistant";

const DOORS: readonly {
  readonly detail: string;
  readonly id: Door;
  readonly title: string;
}[] = [
  {
    detail:
      "Ask for research, comparisons and purchases. Froggy works in a Chrome you can watch and take over.",
    id: "here",
    title: "Use Froggy here",
  },
  {
    detail:
      "Claude Code, Cursor or any MCP client gets Froggy’s wallet and browser, under your spending rules.",
    id: "assistant",
    title: "Connect your own assistant",
  },
];

const NOTICE: readonly { readonly icon: LucideIcon; readonly text: string }[] =
  [
    {
      icon: BotIcon,
      text: "You are talking to an AI agent. It can be wrong, or be misled by a web page, so check what it tells you.",
    },
    {
      icon: MonitorIcon,
      text: "It works in its own Chrome on our servers, never in your browser. You can watch it, or take over, at any time.",
    },
    {
      icon: ShieldCheckIcon,
      text: "It pays only within rules you set next, and only to services you have approved. Code outside the AI enforces those rules; no wording can talk it past them.",
    },
    {
      icon: DatabaseIcon,
      text: "We keep your email, your receipts and that Chrome’s session, which is wiped when you leave. Delete everything from Account, in one click.",
    },
  ];

export const WelcomeStep = ({
  door,
  onContinue,
  onDoor,
}: {
  readonly door: Door;
  readonly onContinue: () => void;
  readonly onDoor: (door: Door) => void;
}): ReactElement => (
  <>
    <StepHeading
      detail="Froggy does things on the web for you — research, comparisons, purchases you approve."
      illustration={<FrogMark className="size-12" pose="idle" />}
      title="Welcome to Froggy."
    />
    <section aria-labelledby="welcome-door" className="flex flex-col gap-3">
      <h2 className="text-section" id="welcome-door">
        How will you use it?
      </h2>
      <fieldset
        aria-labelledby="welcome-door"
        className="grid gap-3 sm:grid-cols-2"
      >
        {DOORS.map((option) => {
          const selected = option.id === door;
          return (
            <label
              className={cn(
                "bg-card shadow-card has-focus-visible:ring-ring flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-xl p-4 text-left has-focus-visible:ring-2",
                selected ? "ring-primary ring-2" : "hover:bg-muted"
              )}
              key={option.id}
            >
              <input
                checked={selected}
                className="sr-only"
                name="door"
                onChange={() => {
                  onDoor(option.id);
                }}
                type="radio"
                value={option.id}
              />
              <span className="font-medium">{option.title}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {option.detail}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="text-muted-foreground text-xs">
        You can do both. This only decides what you see after setup.
      </p>
    </section>
    <section aria-labelledby="welcome-notice" className="flex flex-col gap-3">
      <h2 className="text-section" id="welcome-notice">
        Before you start
      </h2>
      <ul className="flex flex-col gap-3">
        {NOTICE.map(({ icon: Icon, text }) => (
          <li className="flex items-start gap-3 text-sm" key={text}>
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
              <Icon aria-hidden className="size-4" />
            </span>
            <span className="leading-relaxed">{text}</span>
          </li>
        ))}
      </ul>
    </section>
    <StepActions
      primary={
        <Button className="min-h-11" onClick={onContinue}>
          Continue
        </Button>
      }
    />
  </>
);
