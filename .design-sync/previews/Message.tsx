import {
  Bubble,
  BubbleContent,
  FrogMark,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@froggy/ui";

export const FromAgent = () => (
  <div className="w-96">
    <Message>
      <MessageAvatar className="size-8">
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>Research agent</MessageHeader>
        <Bubble variant="muted">
          <BubbleContent>
            I found three providers. The cheapest that covers the week is $12.40
            — that is over your ask-first line, so I stopped.
          </BubbleContent>
        </Bubble>
        <MessageFooter>14:06</MessageFooter>
      </MessageContent>
    </Message>
  </div>
);

export const FromPerson = () => (
  <div className="w-96">
    <Message align="end">
      <MessageContent>
        <Bubble align="end">
          <BubbleContent>Go ahead, but only this once.</BubbleContent>
        </Bubble>
        <MessageFooter>14:07</MessageFooter>
      </MessageContent>
    </Message>
  </div>
);

export const Conversation = () => (
  <MessageGroup className="w-96">
    <Message>
      <MessageAvatar className="size-8">
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>Research agent</MessageHeader>
        <Bubble variant="muted">
          <BubbleContent>
            I need RPC credits to read the pool you asked about.
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
    <Message align="end">
      <MessageContent>
        <Bubble align="end">
          <BubbleContent>How much?</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
    <Message>
      <MessageAvatar className="size-8">
        <FrogMark className="size-5" />
      </MessageAvatar>
      <MessageContent>
        <Bubble variant="muted">
          <BubbleContent>
            $0.48. That is under your daily cap, so I have already spent it and
            filed the receipt.
          </BubbleContent>
        </Bubble>
        <MessageFooter>14:02 · receipt #4821</MessageFooter>
      </MessageContent>
    </Message>
  </MessageGroup>
);
