import { Tabs, TabsContent, TabsList, TabsTrigger } from "@froggy/ui";

export const Default = () => (
  <Tabs className="w-96" defaultValue="receipts">
    <TabsList>
      <TabsTrigger value="receipts">Receipts</TabsTrigger>
      <TabsTrigger value="rules">Rules</TabsTrigger>
      <TabsTrigger value="agents">Agents</TabsTrigger>
    </TabsList>
    <TabsContent value="receipts">
      <p className="text-muted-foreground pt-2">
        41 receipts, 3 refused. The refusals are the interesting ones.
      </p>
    </TabsContent>
    <TabsContent value="rules">
      <p className="text-muted-foreground pt-2">Three rules, one paused.</p>
    </TabsContent>
    <TabsContent value="agents">
      <p className="text-muted-foreground pt-2">Two agents connected.</p>
    </TabsContent>
  </Tabs>
);

export const LineVariant = () => (
  <Tabs className="w-96" defaultValue="body">
    <TabsList variant="line">
      <TabsTrigger value="body">Body</TabsTrigger>
      <TabsTrigger value="stub">Stub</TabsTrigger>
      <TabsTrigger value="evidence">Evidence</TabsTrigger>
    </TabsList>
    <TabsContent value="body">
      <p className="text-muted-foreground pt-2">
        What the spend was for, in a sentence.
      </p>
    </TabsContent>
    <TabsContent value="stub">
      <p className="text-machine text-muted-foreground pt-2 text-xs">
        rule daily-cap · tx 0.0.4821@1757… · snapshot 9f2c41ab
      </p>
    </TabsContent>
    <TabsContent value="evidence">
      <p className="text-muted-foreground pt-2">
        3 of 3 Graph indexes answered at a current block.
      </p>
    </TabsContent>
  </Tabs>
);

export const Vertical = () => (
  <Tabs className="w-96" defaultValue="cap" orientation="vertical">
    <TabsList>
      <TabsTrigger value="cap">Daily cap</TabsTrigger>
      <TabsTrigger value="ask">Ask first</TabsTrigger>
      <TabsTrigger value="deny">Always deny</TabsTrigger>
    </TabsList>
    <TabsContent value="cap">
      <p className="text-muted-foreground">$25.00 per day.</p>
    </TabsContent>
    <TabsContent value="ask">
      <p className="text-muted-foreground">Anything over $10.00.</p>
    </TabsContent>
    <TabsContent value="deny">
      <p className="text-muted-foreground">Any address not on the list.</p>
    </TabsContent>
  </Tabs>
);

export const Disabled = () => (
  <Tabs className="w-96" defaultValue="receipts">
    <TabsList>
      <TabsTrigger value="receipts">Receipts</TabsTrigger>
      <TabsTrigger disabled value="audit">
        Audit log
      </TabsTrigger>
    </TabsList>
    <TabsContent value="receipts">
      <p className="text-muted-foreground pt-2">
        The audit log opens once the agent has spent something.
      </p>
    </TabsContent>
  </Tabs>
);
