/**
 * The welcome: four steps, then Home.
 *
 * Shown once per account, right after sign-up, and again whenever Home is
 * asked to show it. Only one thing here is genuinely necessary — the grant
 * that lets the agent pay — and even that can be skipped; the flow is where
 * a person learns what they are dealing with and sets what they want to.
 * The steps are component state rather than URLs: the flow has its own Back,
 * and a half-finished welcome is not a place to return to.
 *
 * Every way out writes the same fact, that this person has been welcomed,
 * and lands on Home — or in the conversation, when the last screen's
 * composer was used.
 */

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";

import { EmailStep } from "../components/welcome/email-step";
import type { StepIndex } from "../components/welcome/frame";
import { WelcomeFrame } from "../components/welcome/frame";
import { NotificationsStep } from "../components/welcome/notifications-step";
import { ReadyAssistant, ReadyHere } from "../components/welcome/ready-step";
import { RulesStep } from "../components/welcome/rules-step";
import { WelcomeStep } from "../components/welcome/welcome-step";
import type { Door } from "../components/welcome/welcome-step";
import { useSetup } from "../hooks/use-setup";
import { useChatSurface } from "../lib/chat-context";
import { useWorkspace } from "../lib/workspace-context";

export const WelcomePage = (): ReactElement => {
  const { app } = useWorkspace();
  const { busy, send, stopRun } = useChatSurface();
  const { markSeen } = useSetup();
  const navigate = useNavigate();
  const [step, setStep] = useState<StepIndex>(0);
  const [door, setDoor] = useState<Door>("here");

  const finish = (): void => {
    markSeen();
    void navigate({ replace: true, to: "/" });
  };
  const start = (text: string): void => {
    markSeen();
    send(text);
    void navigate({ replace: true, to: "/chat" });
  };
  const origin =
    app.mcpUrl === null ? window.location.origin : new URL(app.mcpUrl).origin;

  return (
    <WelcomeFrame current={step} onSkip={step === 0 ? finish : undefined}>
      {step === 0 ? (
        <WelcomeStep
          door={door}
          onContinue={() => {
            setStep(1);
          }}
          onDoor={setDoor}
        />
      ) : null}
      {step === 1 ? (
        <RulesStep
          onBack={() => {
            setStep(0);
          }}
          onContinue={() => {
            setStep(2);
          }}
        />
      ) : null}
      {step === 2 ? (
        <NotificationsStep
          configured={app.modes?.telegram === "live"}
          onBack={() => {
            setStep(1);
          }}
          onContinue={() => {
            setStep(3);
          }}
        />
      ) : null}
      {step === 3 ? (
        <EmailStep
          onBack={() => {
            setStep(2);
          }}
          onContinue={() => {
            setStep(4);
          }}
        />
      ) : null}
      {step === 4 && door === "here" ? (
        <ReadyHere
          busy={busy}
          connected={app.connected}
          onFinish={finish}
          onSend={start}
          onStop={() => {
            stopRun.stop();
          }}
        />
      ) : null}
      {step === 4 && door === "assistant" ? (
        <ReadyAssistant onFinish={finish} origin={origin} />
      ) : null}
    </WelcomeFrame>
  );
};
