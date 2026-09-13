import { Button } from "@froggy/ui/components/button";
import { FrogMark } from "@froggy/ui/components/frog-mark";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  GiftIcon,
  GlobeIcon,
  MailIcon,
  PackageIcon,
  PlusIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TerminalIcon,
  WalletIcon,
} from "lucide-react";
import { useState } from "react";

import { LandingSignIn } from "../components/landing/controls";
import { UseCases, WorkflowPreview } from "../components/landing/examples";
import { landingAsset } from "../lib/landing";

const LandingHeader = () => (
  <header className="landing-header landing-container">
    <Link to="/" className="landing-wordmark" aria-label="Froggy home">
      <FrogMark compact />
      froggy.
    </Link>
    <nav aria-label="Page navigation">
      <a href="#possibilities">What it can do</a>
      <a href="#watch">See it in action</a>
      <a href="#connect">Bring your agent</a>
    </nav>
    <LandingSignIn compact />
  </header>
);

const Hero = () => (
  <section className="landing-hero landing-container">
    <div className="landing-hero-copy">
      <p className="landing-eyebrow">
        <span className="landing-live-dot" /> A LITTLE HELP. A LOT OF
        POSSIBILITY.
      </p>
      <h1>
        A home for
        <br />
        your
        <br />
        <span>agents.</span>
      </h1>
      <p className="landing-hero-subtitle">
        A browser. A wallet. An inbox.
        <br />
        All for your agents.
      </p>
      <p className="landing-hero-intro">
        Use Froggy directly, or bring the agent you already love.
      </p>
      <div className="landing-hero-actions">
        <LandingSignIn />
        <a className="landing-watch-link" href="#watch">
          Explore an example <ArrowRightIcon size={17} />
        </a>
      </div>
      <a className="landing-agent-link" href="#connect">
        Already have an agent? <span>Make it at home ↗</span>
      </a>
      <p className="landing-hero-note">
        <ShieldCheckIcon size={15} />
        Your workspace. Your spending controls.
      </p>
    </div>
    <div className="landing-hero-art">
      <img
        src={landingAsset("playground-hero.webp")}
        srcSet={`${landingAsset("playground-hero-720.webp")} 720w, ${landingAsset("playground-hero.webp")} 1440w`}
        sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) 45vw, 590px"
        width={1440}
        height={960}
        fetchPriority="high"
        alt="Froggy with a laptop, wallet, envelope, shopping bag and telescope"
      />
      <span className="landing-art-chip landing-chip-browser">
        <GlobeIcon size={16} />
        One shared browser
      </span>
      <span className="landing-art-chip landing-chip-wallet">
        <WalletIcon size={16} />
        Your spending controls
      </span>
      <span className="landing-art-chip landing-chip-inbox">
        <MailIcon size={16} />
        An inbox of its own
      </span>
      <span className="landing-sticker">
        THINK BIG.
        <br />
        HOP TO IT.
      </span>
    </div>
    <a href="#watch" className="landing-hero-scroll">
      <ArrowDownIcon size={16} /> MUCH MORE THAN A CHATBOX
    </a>
  </section>
);

const supporting = [
  {
    icon: GiftIcon,
    title: "A gift with a little thought.",
    text: "Compare gift ideas and digital purchases for someone’s interests. Check region and redemption terms before buying.",
  },
  {
    icon: PackageIcon,
    title: "The follow-up, too.",
    text: "Check an order update, gather the details, and prepare a support reply for you to review.",
  },
  {
    icon: FileTextIcon,
    title: "Research you can keep.",
    text: "Turn findings into a report. Prepare an email with the attachment, ready for your approval.",
  },
] as const;

const Toolkit = () => (
  <section className="landing-toolkit-wrap" aria-labelledby="toolkit-title">
    <div className="landing-container landing-section">
      <div className="landing-section-top">
        <div>
          <p className="landing-eyebrow">GOOD TOOLS. BETTER TOGETHER.</p>
          <h2 id="toolkit-title">
            All the right things.
            <br />
            <mark>In the same place.</mark>
          </h2>
        </div>
        <p>
          The browser finds the context.
          <br />
          The rest helps carry it through.
        </p>
      </div>
      <div className="landing-toolkit-grid">
        <article className="landing-toolkit-browser">
          <div className="landing-toolkit-icons">
            <GlobeIcon />
            <PlusIcon />
            <WalletIcon />
          </div>
          <h3>
            A browser to work in.
            <br />A wallet when it’s needed.
          </h3>
          <p>
            Watch your agent work in a shared Chrome. Take over the same page
            when it needs your touch. Review supported payments with the wallet
            built into the workspace.
          </p>
          <a href="#money">
            See how spending works <ArrowRightIcon size={16} />
          </a>
          <div
            className="landing-handoff-diagram"
            aria-label="Agent works, you take over, agent resumes"
          >
            <span>Agent works</span>
            <ArrowRightIcon size={16} />
            <span>Your turn</span>
            <ArrowRightIcon size={16} />
            <span>Hand it back</span>
          </div>
        </article>
        <article className="landing-toolkit-inbox">
          <MailIcon />
          <h3>An inbox with context.</h3>
          <p>
            Keep expected verification emails, receipts and replies with the
            work. Prepare a response; review it before sending.
          </p>
          <div className="landing-mail-preview" data-media-slot="inbox">
            <span className="landing-eyebrow">EXAMPLE / DRAFT</span>
            <strong>About my order…</strong>
            <span>
              Order details attached.
              <br />
              Ready for your review.
            </span>
            <MailIcon size={21} />
          </div>
        </article>
        <article className="landing-toolkit-telegram">
          <SendIcon />
          <h3>
            Out and about?
            <br />
            Stay in the loop.
          </h3>
          <p>
            Link Telegram for conversations and useful updates. When a wallet
            action needs your signature, review it in Froggy.
          </p>
          <div className="landing-notification" data-media-slot="telegram">
            <span className="landing-eyebrow">EXAMPLE UPDATE</span>
            <strong>Your report is ready to review.</strong>
            <a href="#watch">
              Explore the walkthrough <ArrowUpRightIcon size={14} />
            </a>
          </div>
        </article>
      </div>
      <div className="landing-supporting">
        {supporting.map((item) => (
          <article key={item.title}>
            <item.icon size={25} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <p className="landing-caption">
        Workflow ideas depend on the website, available tools and permissions
        you choose.
      </p>
    </div>
  </section>
);

const Connect = () => {
  const [feedback, setFeedback] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Read ${window.location.origin}/skill.md for Froggy’s connection instructions. Connect a compatible MCP client to ${window.location.origin}/mcp, then sign in and approve its access in Froggy. Connecting is not permission to buy a task.`
      );
      setFeedback("Connection instructions copied.");
    } catch {
      setFeedback(
        "Copy wasn’t available. Open the connection guide below to read or copy the instructions."
      );
    }
  };
  return (
    <section
      className="landing-section landing-container landing-connect"
      id="connect"
      aria-labelledby="connect-title"
    >
      <div>
        <p className="landing-eyebrow">BRING YOUR FAVOURITE BRAINS</p>
        <h2 id="connect-title">
          Don’t replace
          <br />
          your agent.
          <br />
          <mark>Upgrade it.</mark>
        </h2>
        <p className="landing-body-copy">
          Your agent already knows how you think. Give it a workspace to do
          more: a browser, wallet, inbox and tools, connected through MCP.
        </p>
        <p className="landing-body-copy">
          You sign in, choose the access, and can disconnect it from
          Connections. Your agent can’t approve its own payments or change
          spending authority.
        </p>
        <Button
          className="landing-outline-button"
          variant="outline"
          onClick={() => {
            void copy();
          }}
        >
          <CopyIcon data-icon="inline-start" />
          Copy connection instructions
        </Button>
        <output className="landing-copy-status">{feedback}</output>
        <div className="mt-2 flex flex-col items-start">
          <Link
            className="landing-text-link"
            search={{ tab: "agents" }}
            to="/activity"
          >
            Open Connections to connect your agent <ArrowRightIcon size={16} />
          </Link>
          <a
            className="landing-text-link"
            href="/skill.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the connection guide <ArrowUpRightIcon size={16} />
          </a>
        </div>
      </div>
      <div className="landing-connect-diagram" data-media-slot="connections">
        <div className="landing-agent-source">
          <TerminalIcon />
          <span>
            Your favourite agent<small>Compatible MCP client</small>
          </span>
        </div>
        <div className="landing-connector">
          <span />
          You approve the connection
          <span />
        </div>
        <div className="landing-agent-home">
          <FrogMark compact />
          <strong>Make yourself at home.</strong>
          <span>A Froggy workspace</span>
          <div className="landing-agent-tools">
            {[
              { icon: GlobeIcon, text: "Browser" },
              { icon: WalletIcon, text: "Wallet" },
              { icon: MailIcon, text: "Inbox" },
              { icon: SparklesIcon, text: "Tools" },
              { icon: SendIcon, text: "Updates" },
            ].map((item) => (
              <span key={item.text}>
                <item.icon size={21} />
                {item.text}
              </span>
            ))}
          </div>
        </div>
        <p className="landing-caption">
          One connection. The capabilities you allow.
        </p>
      </div>
    </section>
  );
};

const BalanceNote = () => (
  <section
    className="landing-balance landing-container"
    id="money"
    aria-labelledby="balance-title"
  >
    <div>
      <p className="landing-eyebrow">YOU SET THE BOUNDARIES</p>
      <h2 id="balance-title">
        Two balances.
        <br />
        One clear picture.
      </h2>
      <p>
        Running the work and paying for something are different jobs. Keep their
        funding and permissions separate.
      </p>
    </div>
    <div className="landing-balance-cards">
      <article>
        <SparklesIcon />
        <h3>Credits run the work.</h3>
        <p>
          For agent usage and supported workspace services. See the cost and the
          record of paid work.
        </p>
      </article>
      <article>
        <WalletIcon />
        <h3>Your wallet pays for things.</h3>
        <p>
          Separately funded, for supported purchases and trades. Spending
          authority comes from you.
        </p>
      </article>
      <p className="landing-card-note">
        <ShieldCheckIcon size={18} />
        An alert doesn’t buy, sell, send an email or change permissions. Review
        the next action in Froggy.
      </p>
    </div>
  </section>
);

const questions = [
  {
    question: "Do I need a wallet extension?",
    answer:
      "Froggy uses an embedded wallet in the workspace, so a separate browser extension isn’t required for its supported wallet flows. Funding and authorizing wallet actions are separate from signing in.",
  },
  {
    question: "Can I use my existing agent?",
    answer:
      "Yes, compatible MCP clients can connect using Froggy’s public connection instructions. You sign in to approve the connection and its access. Your client needs to support the connection method; connecting alone doesn’t authorize paid work.",
  },
  {
    question: "What can it do without asking?",
    answer:
      "That depends on the task, connection scopes and authority you have explicitly granted. Paid work uses your credit controls; wallet actions use separate authority. Email drafts need human approval before sending. You can take over the browser or disconnect an agent.",
  },
  {
    question: "How do credits differ from wallet funds?",
    answer:
      "Credits pay for running agents and supported workspace services. Wallet funds pay for supported purchases and trades. Credits aren’t transferable wallet funds or trading capital, and funding one doesn’t fund the other.",
  },
  {
    question: "Which networks and merchants are supported?",
    answer:
      "Base and Robinhood Chain are the intended mainnet product direction; available networks and payment methods vary by operation and configuration. Robinhood Chain is a blockchain, not a Robinhood brokerage-account connection. Shopping, travel and ticket previews are example workflows. Check the current tool, merchant and payment support in Froggy before any purchase.",
  },
  {
    question: "How do monitoring and updates work?",
    answer:
      "Saving an item doesn’t start monitoring. Choose the watch, conditions, cadence and any budget it needs. Configured monitoring can produce observations and updates; the exact combinations shown here are examples. Link Telegram for updates away from your desk. An alert never automatically buys, sells or sends an email.",
  },
] as const;

const SetupAndFaq = () => (
  <section
    className="landing-section landing-container"
    id="setup"
    aria-labelledby="setup-title"
  >
    <div className="landing-section-top">
      <div>
        <p className="landing-eyebrow">A SMALL START IS STILL A START</p>
        <h2 id="setup-title">
          Make room for
          <br />
          <mark>a little help.</mark>
        </h2>
      </div>
      <p>
        You don’t have to set up everything.
        <br />
        Start with what your task needs.
      </p>
    </div>
    <ol className="landing-steps">
      {[
        { title: "Come on in.", text: "Sign in to your Froggy workspace." },
        {
          title: "Make it yours.",
          text: "Choose the capabilities you need. Bring an existing agent if you like.",
        },
        {
          title: "Give it a first task.",
          text: "Set the relevant permissions and spending controls, then ask away.",
        },
      ].map((item, index) => (
        <li key={item.title}>
          <span className="landing-step-index">0{index + 1}</span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
    <div className="landing-faq">
      <h3>A few good questions.</h3>
      <div>
        {questions.map((item) => (
          <details key={item.question}>
            <summary>
              {item.question}
              <PlusIcon size={18} />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  </section>
);

const LandingFooter = () => (
  <>
    <section className="landing-closing landing-container">
      <p className="landing-eyebrow">MAKE YOURSELF AT HOME</p>
      <h2>
        You’ve got ideas.
        <br />
        Froggy’s got you.
      </h2>
      <LandingSignIn />
      <a href="#connect" className="landing-text-link">
        Or bring your own agent <ArrowUpRightIcon size={16} />
      </a>
      <CheckIcon className="landing-closing-check" aria-hidden />
    </section>
    <footer className="landing-footer landing-container">
      <Link to="/" className="landing-wordmark">
        <FrogMark compact />
        froggy.
      </Link>
      <p>A home for your agents.</p>
      <a
        href="https://github.com/grmkris/Froggy-ETHOnline2026"
        target="_blank"
        rel="noreferrer"
      >
        Made in the open <ArrowUpRightIcon size={15} />
      </a>
      <a href="/skill.md" target="_blank" rel="noreferrer">
        Connection guide <ArrowUpRightIcon size={15} />
      </a>
      <Link search={{ tab: "agents" }} to="/activity">
        Connections <ArrowRightIcon size={15} />
      </Link>
    </footer>
  </>
);

export const LandingIndexPage = () => (
  <div className="landing playground" data-landing="playground">
    <a className="landing-skip" href="#landing-main">
      Skip to content
    </a>
    <LandingHeader />
    <main id="landing-main">
      <Hero />
      <div className="landing-capabilities" aria-label="Workspace capabilities">
        <span>Browse</span>
        <span>Research</span>
        <span>Watch</span>
        <span>Prepare</span>
        <span>Connect</span>
      </div>
      <WorkflowPreview />
      <UseCases />
      <Toolkit />
      <Connect />
      <BalanceNote />
      <SetupAndFaq />
      <LandingFooter />
    </main>
  </div>
);
