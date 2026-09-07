import {
  Bubble,
  BubbleContent,
  FrogMark,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@froggy/ui";

const TURNS: readonly (readonly [string, "agent" | "person"])[] = [
  ["I need RPC credits to read the pool you asked about.", "agent"],
  ["How much?", "person"],
  [
    "$0.48. Under your daily cap, so I have already filed the receipt.",
    "agent",
  ],
  ["Good. Keep going.", "person"],
  ["Found three providers. The cheapest for the week is $12.40.", "agent"],
  ["That is over your ask-first line, so I stopped before signing.", "agent"],
];

export const Conversation = () => (
  <div className="ring-foreground/10 h-72 w-96 overflow-hidden rounded-xl ring-1">
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport className="px-3 py-4">
          <MessageScrollerContent className="gap-3">
            {TURNS.map(([text, who], i) => (
              <MessageScrollerItem key={String(i)} messageId={String(i)}>
                {who === "agent" ? (
                  <Message>
                    <MessageAvatar className="size-8">
                      <FrogMark className="size-5" />
                    </MessageAvatar>
                    <MessageContent>
                      {i === 0 && <MessageHeader>Research agent</MessageHeader>}
                      <Bubble variant="muted">
                        <BubbleContent>{text}</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                ) : (
                  <Message align="end">
                    <MessageContent>
                      <Bubble align="end">
                        <BubbleContent>{text}</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                )}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  </div>
);

export const FromTop = () => (
  <div className="ring-foreground/10 h-56 w-96 overflow-hidden rounded-xl ring-1">
    <MessageScrollerProvider defaultScrollPosition="start">
      <MessageScroller>
        <MessageScrollerViewport className="px-3 py-4">
          <MessageScrollerContent className="gap-3">
            {TURNS.slice(0, 3).map(([text], i) => (
              <MessageScrollerItem key={String(i)} messageId={String(i)}>
                <Bubble variant="muted">
                  <BubbleContent>{text}</BubbleContent>
                </Bubble>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
    </MessageScrollerProvider>
  </div>
);
