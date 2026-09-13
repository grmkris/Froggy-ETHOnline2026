import { Button } from "@froggy/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@froggy/ui/components/tabs";
import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  GlobeIcon,
  PlaneIcon,
  ShoppingBagIcon,
  TicketIcon,
} from "lucide-react";
import { useState } from "react";

import { landingAsset } from "../../lib/landing";

const workflow = [
  {
    name: "Ask",
    title: "A little less searching.",
    text: "Compare three everyday headphones. Comfortable for a long train ride, with a replaceable cable. Prepare a short report.",
    detail: "Your request keeps the useful details together.",
    label: "YOUR REQUEST",
  },
  {
    name: "Work",
    title: "Put the browser to work.",
    text: "Check the product pages, compare the details, and keep the sources alongside the findings.",
    detail: "Follow the shared browser. Take over when a page needs you.",
    label: "RESEARCH IN PROGRESS",
  },
  {
    name: "Review",
    title: "A draft, ready for your eyes.",
    text: "The comparison is prepared. Check the sources and the email draft before deciding whether to send it.",
    detail: "Recipients, message and attachments need your review in Froggy.",
    label: "YOUR TURN TO REVIEW",
  },
  {
    name: "Result",
    title: "Something you can use.",
    text: "A comparison report, its source links, and a record of the work. Keep the report, or approve a separate email send.",
    detail:
      "A prepared draft is not a sent email. Any paid work has its own credit receipt.",
    label: "REPORT PREPARED",
  },
] as const;

export const WorkflowPreview = () => {
  const [step, setStep] = useState(0);
  const current = workflow[step] ?? workflow[0];
  return (
    <section
      className="landing-section landing-container"
      id="watch"
      aria-labelledby="workflow-title"
    >
      <div className="landing-section-top">
        <div>
          <p className="landing-eyebrow">
            LESS BACK-AND-FORTH. MORE FOLLOW-THROUGH.
          </p>
          <h2 id="workflow-title">
            From a request
            <br />
            to a <mark>result.</mark>
          </h2>
        </div>
        <p>
          A place to do the work, keep the context,
          <br className="landing-desktop-break" /> and bring you in when it
          matters.
        </p>
      </div>
      <div className="landing-workflow" data-media-slot="request-to-result">
        <div className="landing-preview-bar">
          <span>
            <GlobeIcon size={15} /> A little walkthrough
          </span>
          <span>Interactive example · illustrative data</span>
        </div>
        <div className="landing-workflow-body">
          <div
            className="landing-workflow-story"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="landing-eyebrow">
              0{step + 1} / {current.label}
            </p>
            <h3>{current.title}</h3>
            <p>{current.text}</p>
            <p className="landing-workflow-detail">{current.detail}</p>
          </div>
          <div
            className="landing-report"
            aria-label="Illustrative headphone comparison report"
          >
            <div className="landing-report-top">
              <span>FIELD NOTES</span>
              <span>01—03</span>
            </div>
            <h4>The long-ride shortlist.</h4>
            <p>Everyday headphones / comparison outline</p>
            {[
              "Comfort over a long journey",
              "Replaceable cable & repairability",
              "Total price & return terms",
            ].map((item, index) => (
              <div className="landing-report-row" key={item}>
                <span>0{index + 1}</span>
                <span>{item}</span>
                <CheckIcon size={17} />
              </div>
            ))}
            <div className="landing-report-bottom">
              <span>Sources stay with the report.</span>
              <span>Draft · example</span>
            </div>
          </div>
        </div>
        <div className="landing-workflow-controls">
          <ol aria-label="Walkthrough progress">
            {workflow.map((item, index) => (
              <li
                key={item.name}
                aria-current={index === step ? "step" : undefined}
              >
                <span>{index + 1}</span>
                {item.name}
              </li>
            ))}
          </ol>
          <Button
            className="landing-outline-button"
            variant="outline"
            onClick={() => {
              setStep((step + 1) % workflow.length);
            }}
          >
            {step === 3 ? "Start again" : "Next step"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>
      <p className="landing-caption">
        Explore the idea. This preview doesn’t run a task or send an email.
      </p>
    </section>
  );
};

const scenarios = [
  {
    id: "shopping",
    label: "Shopping",
    icon: ShoppingBagIcon,
    title: "Your size. Your price.",
    highlight: "Your moment.",
    description:
      "The sneakers you saved. That jacket in your colour. A gadget worth waiting for. Keep the details that make a match yours.",
    request:
      "Watch these green sneakers in EU 42. Let me know if they’re back in stock and under €120, delivery included.",
    image: "watch-sneakers",
    alt: "Froggy examining a green sneaker with a magnifying glass",
    result: "A match worth a look.",
    rows: [
      ["Your pick", "Green / EU 42"],
      ["Item + delivery", "€109 + €6 = €115"],
      ["Your ceiling", "€120 total"],
    ],
    action: "Preview a match",
    review:
      "Check the current listing, seller, exact size, final total and available payment method in Froggy before choosing to buy. This example hasn’t observed live stock or placed an order.",
    note: "Price drops, restocks, clothes & gadgets.",
  },
  {
    id: "travel",
    label: "Travel",
    icon: PlaneIcon,
    title: "A weekend that",
    highlight: "actually fits.",
    description:
      "Less tab juggling. More getting away. Compare flights and hotels around your real schedule, with the whole trip in the budget.",
    request:
      "Plan two nights away. Leave Friday after work, return Sunday evening. Keep flights, hotel, baggage and transfers under €500.",
    image: "weekend-trip",
    alt: "Froggy packing a suitcase beside a map and a small airplane",
    result: "Room for a little adventure.",
    rows: [
      ["Flights + baggage", "€180 + €30"],
      ["Hotel · two nights", "€210"],
      ["Transfers / total", "€40 / €460"],
    ],
    action: "Preview a trip",
    review:
      "Review flight times, hotel location, baggage, cancellation terms and current availability before booking. This is an illustrative proposal, not a reservation or a live quote.",
    note: "Itineraries, practical stays & little extras like an eSIM.",
  },
  {
    id: "tickets",
    label: "Tickets & games",
    icon: TicketIcon,
    title: "Less refreshing.",
    highlight: "More living.",
    description:
      "A gig with friends. Seats for the big game. The game on your wishlist. Give the search a few good conditions, then get on with your day.",
    request:
      "Look for two concert tickets together, no more than €160 including fees. Tell me when there’s an option to review.",
    image: "tickets-games",
    alt: "Froggy wearing headphones and holding blank tickets beside a game controller",
    result: "Your next good night out.",
    rows: [
      ["Seats", "Two together"],
      ["Tickets + fees", "€130 + €18"],
      ["Total / ceiling", "€148 / €160"],
    ],
    action: "Preview an alert",
    review:
      "Review the seller, event, seats, fees and transfer or refund terms. Availability alerts don’t buy tickets. Seller and payment support must be checked before any purchase.",
    note: "Concerts, sports, video games & gaming gift cards.",
  },
] as const;

const ScenarioPreview = ({
  scenario,
}: {
  readonly scenario: (typeof scenarios)[number];
}) => {
  const [state, setState] = useState<"ready" | "match" | "review" | "watching">(
    "ready"
  );
  return (
    <div
      className="landing-scenario-preview"
      data-media-slot={`scenario-${scenario.id}`}
    >
      <img
        src={landingAsset(`${scenario.image}.webp`)}
        srcSet={`${landingAsset(`${scenario.image}-480.webp`)} 480w, ${landingAsset(`${scenario.image}.webp`)} 960w`}
        sizes="(max-width: 700px) calc(100vw - 40px), 520px"
        width={960}
        height={720}
        loading="lazy"
        alt={scenario.alt}
      />
      <div className="landing-example-card">
        <p className="landing-eyebrow">
          <BellIcon size={14} /> EXAMPLE WORKFLOW · FICTIONAL VALUES
        </p>
        <h4>{scenario.result}</h4>
        <dl>
          {scenario.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <output key={state} className="landing-example-status">
          {state === "ready" ? "Your conditions, ready to explore." : null}
          {state === "match"
            ? "Example match found. Your next step is a review."
            : null}
          {state === "review" ? scenario.review : null}
          {state === "watching"
            ? "Kept watching in this example. No live monitor was created."
            : null}
        </output>
        {state === "match" ? (
          <div className="landing-example-actions">
            <Button
              onClick={() => {
                setState("review");
              }}
            >
              Review example
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setState("watching");
              }}
            >
              Keep watching
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="landing-outline-button"
            onClick={() => {
              setState("match");
            }}
          >
            {state === "ready" ? scenario.action : "Show example again"}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        )}
      </div>
    </div>
  );
};

export const UseCases = () => (
  <section
    className="landing-section landing-container"
    id="possibilities"
    aria-labelledby="cases-title"
  >
    <div className="landing-section-top">
      <div>
        <p className="landing-eyebrow">LIFE HAS BETTER THINGS FOR YOU TO DO</p>
        <h2 id="cases-title">
          Big plans.
          <br />
          <mark>Little legwork.</mark>
        </h2>
      </div>
      <p>
        A few ideas for your next “could you…?”
        <br className="landing-desktop-break" /> Pick one and explore the
        example.
      </p>
    </div>
    <Tabs defaultValue="shopping" className="landing-cases">
      <TabsList className="landing-case-tabs" aria-label="Example workflows">
        {scenarios.map((scenario) => (
          <TabsTrigger key={scenario.id} value={scenario.id}>
            <scenario.icon />
            {scenario.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {scenarios.map((scenario) => (
        <TabsContent
          key={scenario.id}
          value={scenario.id}
          className="landing-scenario"
        >
          <div className="landing-scenario-copy">
            <p className="landing-eyebrow">
              {scenario.label.toUpperCase()} / EXAMPLE WORKFLOW
            </p>
            <h3>
              {scenario.title}
              <br />
              <mark>{scenario.highlight}</mark>
            </h3>
            <p>{scenario.description}</p>
            <blockquote>“{scenario.request}”</blockquote>
            <p className="landing-small-note">{scenario.note}</p>
            {scenario.id === "shopping" ? (
              <p className="landing-small-note">
                Have another condition in mind? An example could combine a
                product match with a wallet condition you choose. An alert is
                only an alert; it never sells tokens or buys the item.
              </p>
            ) : null}
          </div>
          <ScenarioPreview scenario={scenario} />
        </TabsContent>
      ))}
    </Tabs>
  </section>
);
