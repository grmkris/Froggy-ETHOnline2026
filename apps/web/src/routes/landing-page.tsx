import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpRightIcon,
  CheckIcon,
  GlobeIcon,
  MailIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";

import { LandingPromo, LandingSignIn } from "../components/landing/controls";
import { landingAsset } from "../lib/landing";
import type { LandingVariant } from "../lib/landing";

const concepts = [
  {
    variant: "pond",
    title: "The Pond",
    note: "A little calmer. A lot more capable.",
    description:
      "A welcoming place for big ideas, with a pond-side desk and room to breathe.",
    to: "/landing/pond",
  },
  {
    variant: "playground",
    title: "The Playground",
    note: "Big ideas. Tiny sidekick.",
    description:
      "A bright, playful toolkit for the agents that help you get things done.",
    to: "/landing/playground",
  },
  {
    variant: "glasshouse",
    title: "The Glasshouse",
    note: "Your next idea starts here.",
    description:
      "A luminous little world where your browser, money and agents come together.",
    to: "/landing/glasshouse",
  },
] as const;

const features = [
  {
    number: "01",
    title: "Browse and buy.",
    subtitle: "Give the busywork a buddy.",
    description:
      "Research a purchase, compare options and share a real browser with your agent. Take over whenever you need to. Review supported card checkouts before they go through.",
    tags: ["Shared Chrome", "Saved-card checkout", "Human handoff"],
    image: "card-checkout",
    screen: "browser",
    label: "The shared Froggy browser in a labelled local demonstration",
  },
  {
    number: "02",
    title: "Research and trade.",
    subtitle: "An idea. A quote. Your call.",
    description:
      "Explore onchain data and trading routes in one workspace. Inspect the quote and spending controls before a trade. Keep the receipt after it.",
    tags: ["Onchain research", "Swap quotes", "Spending controls"],
    image: "trading",
    screen: "trading",
    label: "Froggy trading tools with demonstration providers labelled",
  },
  {
    number: "03",
    title: "Watch and follow up.",
    subtitle: "Less checking. More knowing.",
    description:
      "Keep interesting things on your watchlist. Set a routine, catch an update, and follow the conversation through email or Telegram.",
    tags: ["Watchlists", "Scheduled routines", "Email + Telegram"],
    image: "watchlist",
    screen: "watchlist",
    label: "Froggy watchlist in the local demonstration workspace",
  },
  {
    number: "04",
    title: "Connect your agents.",
    subtitle: "Bring your favourite brains.",
    description:
      "Give your coding agent a browser and useful tools. Connect compatible MCP clients, including ChatGPT where custom connectors are available, to the same Froggy workspace.",
    tags: ["Coding agents", "MCP", "OAuth connections"],
    image: "coding-agent",
    screen: "connections",
    label:
      "The real Froggy agent connections screen in local demonstration mode",
  },
] as const;

const steps = [
  {
    name: "Give it a balance.",
    image: "balance",
    text: "Add credits for running tasks. Fund your wallet separately for supported purchases and trades.",
  },
  {
    name: "Make room for mail.",
    image: "email",
    text: "Set up an inbox for messages, replies and the attachments that come with getting things done.",
  },
  {
    name: "Keep in touch.",
    image: "telegram",
    text: "Connect Telegram to continue a conversation and receive updates away from your desk.",
  },
  {
    name: "Bring a coding agent.",
    image: "coding-agent",
    text: "Connect your development tools to Froggy’s browser and workspace capabilities.",
  },
  {
    name: "Connect your chat.",
    image: "chatgpt-mcp",
    text: "Use MCP to bring the workspace into a compatible chat client, with a connection you approve.",
  },
] as const;

const LandingHeader = () => (
  <header className="landing-header landing-container">
    <Link
      to="/landing"
      className="landing-wordmark"
      aria-label="Froggy landing concepts"
    >
      <FrogMark compact />
      froggy<span className="landing-wordmark-dot">.</span>
    </Link>
    <nav aria-label="Page navigation">
      <a href="#possibilities">What it can do</a>
      <a href="#setup">Make it yours</a>
      <a href="#watch">
        Meet Froggy <PlayIcon size={12} />
      </a>
    </nav>
    <LandingSignIn compact />
  </header>
);

const Hero = ({ variant }: { readonly variant: LandingVariant }) => (
  <section className="landing-hero landing-container">
    <div className="landing-hero-copy">
      <p className="landing-eyebrow">
        <span className="landing-live-dot" /> A LITTLE HELP. A LOT OF
        POSSIBILITY.
      </p>
      <h1>
        A home for
        <br />
        your <span>agents.</span>
      </h1>
      <p className="landing-hero-subtitle">
        A browser. A balance. An inbox.
        <br />
        All for your agents.
      </p>
      <div className="landing-hero-actions">
        <LandingSignIn />
        <a className="landing-watch-link" href="#watch">
          <span>
            <PlayIcon size={15} fill="currentColor" />
          </span>
          See what’s possible
        </a>
      </div>
      <p className="landing-hero-note">
        <ShieldCheckIcon size={15} />
        Your workspace. Your spending controls.
      </p>
    </div>
    <div className="landing-hero-art">
      <img
        src={landingAsset(`${variant}-hero.webp`)}
        width={1440}
        height={960}
        fetchPriority="high"
        alt={
          {
            pond: "Froggy at a cosy desk beside a pond, with a laptop, wallet and mailbox",
            playground:
              "Froggy surrounded by a playful toolkit of a laptop, wallet, shopping bag and telescope",
            glasshouse:
              "Froggy in a glowing glass greenhouse with a miniature workstation",
          }[variant]
        }
      />
      <span className="landing-art-chip landing-chip-browser">
        <GlobeIcon size={16} />
        One shared browser
      </span>
      <span className="landing-art-chip landing-chip-wallet">
        <WalletIcon size={16} />A little spending power
      </span>
      <span className="landing-art-chip landing-chip-inbox">
        <MailIcon size={16} />
        An inbox of its own
      </span>
      {variant === "playground" ? (
        <span className="landing-sticker">
          THINK BIG.
          <br />
          HOP TO IT.
        </span>
      ) : null}
    </div>
    <a href="#possibilities" className="landing-hero-scroll">
      <ArrowDownIcon size={16} /> MUCH MORE THAN A CHATBOX
    </a>
  </section>
);

const FeatureSections = () => (
  <section
    id="possibilities"
    className="landing-features landing-container"
    aria-labelledby="features-title"
  >
    <div className="landing-section-top">
      <div>
        <p className="landing-eyebrow">IDEAS NEED SOMEWHERE TO GO</p>
        <h2 id="features-title">
          From “what if”
          <br />
          to “all done.”
        </h2>
      </div>
      <p>
        One place for the tools, the context,
        <br />
        and the little tasks in between.
      </p>
    </div>
    {features.map((feature) => (
      <article className="landing-feature" key={feature.number}>
        <div className="landing-feature-copy">
          <span className="landing-feature-number">
            {feature.number} / POSSIBILITIES
          </span>
          <h3>{feature.title}</h3>
          <p className="landing-feature-subtitle">{feature.subtitle}</p>
          <p>{feature.description}</p>
          <ul className="landing-tags">
            {feature.tags.map((tag) => (
              <li key={tag}>
                <CheckIcon size={13} />
                {tag}
              </li>
            ))}
          </ul>
        </div>
        <div className="landing-feature-art">
          <div className="landing-screen-frame">
            <div className="landing-screen-bar">
              <span />
              <span />
              <span />
              <p>
                froggy workspace <span>· local demo</span>
              </p>
            </div>
            <img
              src={landingAsset(`screens/${feature.screen}.webp`)}
              alt={feature.label}
              width={1440}
              height={1000}
              loading="lazy"
            />
          </div>
          <img
            className="landing-feature-frog"
            src={landingAsset(`${feature.image}.webp`)}
            alt=""
            width={640}
            height={640}
            loading="lazy"
          />
        </div>
      </article>
    ))}
  </section>
);

const BalanceNote = () => (
  <section
    className="landing-balance landing-container"
    aria-labelledby="balance-title"
  >
    <div>
      <p className="landing-eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
      <h2 id="balance-title">
        Two balances.
        <br />
        One clear picture.
      </h2>
      <p>
        Running an agent and paying for something are different jobs. Froggy
        keeps them easy to tell apart.
      </p>
    </div>
    <div className="landing-balance-cards">
      <article>
        <SparklesIcon />
        <h3>Credits run the work.</h3>
        <p>
          For agent usage and supported workspace services. See what a task uses
          as you go.
        </p>
      </article>
      <article>
        <WalletIcon />
        <h3>Your wallet pays for things.</h3>
        <p>
          For supported onchain purchases and trades, with separate funding and
          spending authority.
        </p>
      </article>
      <p className="landing-card-note">
        <ShieldCheckIcon size={18} />
        Saved-card checkout is a separate payment method. Review the purchase
        before approval.
      </p>
    </div>
  </section>
);

const SetupPreview = () => (
  <section
    className="landing-setup landing-container"
    id="setup"
    aria-labelledby="setup-title"
  >
    <div className="landing-section-top">
      <div>
        <p className="landing-eyebrow">FIRST, SAY HELLO</p>
        <h2 id="setup-title">
          A few little steps.
          <br />A world of possibility.
        </h2>
      </div>
      <p>
        Sign in to start. Then make
        <br />
        your workspace feel like yours.
      </p>
    </div>
    <ol className="landing-steps">
      {steps.map((step, index) => (
        <li key={step.image}>
          <span className="landing-step-index">0{index + 1}</span>
          <img
            src={landingAsset(`${step.image}.webp`)}
            alt=""
            width={640}
            height={640}
            loading="lazy"
          />
          <h3>{step.name}</h3>
          <p>{step.text}</p>
        </li>
      ))}
    </ol>
  </section>
);

const LandingFooter = () => (
  <>
    <section className="landing-closing landing-container">
      <p className="landing-eyebrow">MAKE YOURSELF AT HOME</p>
      <h2>
        You’ve got ideas.
        <br />
        <span>Froggy’s got you.</span>
      </h2>
      <LandingSignIn />
      <img
        src={landingAsset("telegram.webp")}
        width={640}
        height={640}
        loading="lazy"
        alt="Froggy sending a little paper plane on its way"
      />
    </section>
    <footer className="landing-footer landing-container">
      <Link to="/landing" className="landing-wordmark">
        <FrogMark compact />
        froggy.
      </Link>
      <p>A home for your agents.</p>
      <Link to="/landing">
        Explore the three worlds <ArrowUpRightIcon size={15} />
      </Link>
    </footer>
  </>
);

const LandingPage = ({ variant }: { readonly variant: LandingVariant }) => (
  <div className="landing" data-landing={variant}>
    <a className="landing-skip" href="#landing-main">
      Skip to content
    </a>
    <LandingHeader />
    <main id="landing-main">
      <Hero variant={variant} />
      <div className="landing-capabilities" aria-label="Workspace capabilities">
        <span>Browse</span>
        <span>Buy</span>
        <span>Research</span>
        <span>Trade</span>
        <span>Watch</span>
        <span>Connect</span>
      </div>
      <LandingPromo variant={variant} />
      <FeatureSections />
      <BalanceNote />
      <SetupPreview />
      <LandingFooter />
    </main>
  </div>
);

export const PondLandingPage = () => <LandingPage variant="pond" />;
export const PlaygroundLandingPage = () => <LandingPage variant="playground" />;
export const GlasshouseLandingPage = () => <LandingPage variant="glasshouse" />;
export const LandingIndexPage = () => (
  <div className="landing" data-landing="pond">
    <header className="landing-header landing-container">
      <Link to="/landing" className="landing-wordmark">
        <FrogMark compact />
        froggy.
      </Link>
      <LandingSignIn compact />
    </header>
    <main className="landing-container landing-index">
      <p className="landing-eyebrow">THREE LITTLE WORLDS. ONE FROGGY.</p>
      <h1>
        Find your
        <br />
        <span>happy place.</span>
      </h1>
      <p>
        Three ways to feel at home with your agents.
        <br />
        Take a look around. Each world has its own little film.
      </p>
      <div className="landing-concepts">
        {concepts.map((concept) => (
          <Link
            key={concept.variant}
            to={concept.to}
            className="landing-concept"
            data-concept={concept.variant}
          >
            <img
              src={landingAsset(`${concept.variant}-hero.webp`)}
              width={1440}
              height={960}
              alt={concept.description}
            />
            <div>
              <p className="landing-eyebrow">{concept.note}</p>
              <h2>
                {concept.title}
                <ArrowUpRightIcon />
              </h2>
              <p>{concept.description}</p>
              <span>
                Step inside <ArrowUpRightIcon size={16} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  </div>
);
