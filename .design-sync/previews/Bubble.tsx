import {
  Bubble,
  BubbleContent,
  BubbleGroup,
  BubbleReactions,
} from "@froggy/ui";

export const Variants = () => (
  <BubbleGroup className="w-96">
    <Bubble variant="default">
      <BubbleContent>Default — what the person said.</BubbleContent>
    </Bubble>
    <Bubble variant="secondary">
      <BubbleContent>Secondary</BubbleContent>
    </Bubble>
    <Bubble variant="muted">
      <BubbleContent>Muted — what the agent said.</BubbleContent>
    </Bubble>
    <Bubble variant="tinted">
      <BubbleContent>Tinted</BubbleContent>
    </Bubble>
    <Bubble variant="outline">
      <BubbleContent>Outline</BubbleContent>
    </Bubble>
    <Bubble variant="destructive">
      <BubbleContent>Destructive — the spend was refused.</BubbleContent>
    </Bubble>
    <Bubble variant="ghost">
      <BubbleContent>Ghost — no chrome at all.</BubbleContent>
    </Bubble>
  </BubbleGroup>
);

export const Alignment = () => (
  <BubbleGroup className="w-96">
    <Bubble variant="muted">
      <BubbleContent>Asked from the left.</BubbleContent>
    </Bubble>
    <Bubble align="end">
      <BubbleContent>Answered from the right.</BubbleContent>
    </Bubble>
  </BubbleGroup>
);

export const WithReactions = () => (
  <BubbleGroup className="w-96 pb-4">
    <Bubble variant="muted">
      <BubbleContent>
        I stopped before signing — this one is over your cap.
      </BubbleContent>
      <BubbleReactions align="start" side="bottom">
        👍
      </BubbleReactions>
    </Bubble>
  </BubbleGroup>
);
