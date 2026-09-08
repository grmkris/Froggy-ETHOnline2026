# Building with @froggy/ui

Froggy is light, warm and quiet: paper, ink, one frog-green, and two "driving" colours that mean the same thing everywhere — amber for the agent, blue for the person. Money is set in the display face so a figure reads as a figure.

## Setup

There is **no theme provider**. Every token is a plain CSS custom property on `:root` in the shipped stylesheet, so components are styled the moment `styles.css` is loaded. Do not wrap the app in a ThemeProvider — there isn't one.

Two components _do_ need a context and render blank without it:

- **`TooltipProvider`** — wrap it once near the root. Every `Tooltip` needs it.
- **`MessageScrollerProvider`** — wrap the whole `MessageScroller` subtree. Takes `autoScroll` and `defaultScrollPosition` (`"start"` | `"end"`).

Dark mode is a class, not a media query: `@custom-variant dark (&:is(.dark *))`. Put `class="dark"` on an ancestor; `dark:` utilities then apply.

```jsx
<TooltipProvider>
  <main className="bg-background text-foreground min-h-dvh">{children}</main>
</TooltipProvider>
```

## The styling idiom

**Tailwind 4 utility classes, on semantic tokens — never raw palette colours.** Write `bg-card`, not `bg-white`; `text-muted-foreground`, not `text-gray-500`. The DS defines these families (the real names, from the shipped stylesheet):

| Family | Utilities |
| --- | --- |
| Surfaces | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`, `bg-accent`, `bg-paper-deep`, `bg-sidebar` |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground`, `text-popover-foreground`, `text-primary-foreground`, `text-secondary-foreground`, `text-accent-foreground` |
| Brand & action | `bg-primary`, `text-primary`, `bg-brand`, `bg-brand-soft`, `text-ink` |
| Refusal | `bg-destructive`, `text-destructive`, `bg-refused-soft` |
| Driving state | `bg-drive-agent`, `bg-drive-agent-soft`, `bg-drive-human`, `bg-drive-human-soft` |
| Lines | `border-border`, `border-input`, `ring-ring`, `ring-foreground/10` |
| Radius | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` (all derived from `--radius: 1rem`, so they read rounder than stock Tailwind) |
| Shadow | `shadow-card`, `shadow-float`, `shadow-inset` |
| Type faces | `font-display` (Bricolage Grotesque), `font-sans` (Onest), `font-mono` (IBM Plex Mono) |

Opacity modifiers are idiomatic here and used throughout: `bg-primary/90`, `ring-foreground/10`, `bg-muted/50`.

### Custom utilities this DS adds

These are not stock Tailwind — they are the house style, and using them is what makes a screen look like Froggy rather than like a generic shadcn app:

- **`text-money`** — a currency figure. Use it on every amount.
- **`text-machine`** — ids, hashes, transaction refs; the mono face at small size.
- **`font-display`** — headline face, for the wordmark and big numbers.
- **`ticket` / `ticket-perforation`** — the torn-receipt surface (see `Ticket`).
- **`ring-drive-agent` / `ring-drive-human` / `ring-drive-idle`** — the "who is driving" ring; prefer the `DrivingRing` component over the raw utility.
- **`shimmer`** (with `shimmer-once`, `shimmer-reverse`, `shimmer-color-*`, `shimmer-duration-*`, `shimmer-spread-*`, `shimmer-angle-*`) — loading sheen.
- **`scroll-fade`** and its axis/edge variants (`scroll-fade-y`, `scroll-fade-x`, `scroll-fade-t/b/s/e`, `scroll-fade-*` sizes, `scroll-fade-none`) — fades content at a scroll edge instead of a hard cut.
- **`stamp-refused`** — the refusal stamp treatment.
- **`no-scrollbar`** — hides the scrollbar while keeping the scroll.

### Custom variants

`data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-selected`, `data-disabled`, `data-active`, `data-horizontal`, `data-vertical` — write `data-open:opacity-100`, not `data-[state=open]:opacity-100`.

### Motion

Durations and easings are tokens: `duration-(--motion-feedback)` (125ms), `duration-(--motion-panel)` (200ms), `duration-(--motion-sheet)` (250ms), `ease-(--ease-out)`, `ease-(--ease-drawer)`.

## Composition rules worth knowing

- **`render` instead of `asChild`.** This DS is built on Base UI, so a component that should be a different element takes a `render` prop: `<Badge render={<a href="/receipts" />}>`, `<CollapsibleTrigger render={<Button variant="ghost" />}>`.
- **`data-icon`.** Put `data-icon="inline-start"` or `"inline-end"` on an icon inside a `Button` or `Badge` and the padding tightens on that side.
- **Overlays render their own portal and backdrop.** `DialogContent`, `AlertDialogContent` and `SheetContent` already include the portal, the overlay and a close button. Do not wrap them in `DialogPortal` / `DialogOverlay` yourself.
- **`Bubble` styles its `BubbleContent`.** The variant lives on `Bubble` and reaches the content through a descendant selector, so always use the pair.
- **`Card` sets `--card-spacing`.** `CardHeader`, `CardContent` and `CardFooter` inherit it; `size="sm"` narrows it for every part at once.
- Icons come from **`lucide-react`**, sized `size-4` by default inside controls.

## Where the truth lives

- `_ds/<folder>/styles.css` and everything it `@import`s — the tokens, the fonts and the compiled component CSS. Read it before inventing a class.
- `components/<group>/<Name>/<Name>.prompt.md` — what each component is for.
- `components/<group>/<Name>/<Name>.d.ts` — the exact props.

## An idiomatic screen

```jsx
<Card className="w-96">
  <CardHeader>
    <CardTitle>Today</CardTitle>
    <CardDescription>Four spends, one refused.</CardDescription>
    <CardAction>
      <Badge variant="secondary">Agent active</Badge>
    </CardAction>
  </CardHeader>
  <CardContent className="flex flex-col gap-3">
    <div className="flex items-baseline gap-2">
      <span className="text-money text-2xl leading-none">$4.80</span>
      <span className="text-muted-foreground text-xs">of $25.00 cap</span>
    </div>
    <Progress value={19} />
    <p className="text-machine text-muted-foreground text-xs">
      last receipt · hcs #1204
    </p>
  </CardContent>
  <CardFooter className="gap-2">
    <Button size="sm">Review receipts</Button>
    <Button className="ml-auto" size="sm" variant="ghost">
      Pause agent
    </Button>
  </CardFooter>
</Card>
```

## Composing a screen

The section above is about single components. This one is about the page they sit on — read it before laying out a screen, because most of what makes a Froggy screen look like Froggy happens above the component level.

### Design the column, not the chrome

Every workspace screen renders inside a frame that already exists and is not yours to redesign: a left rail with icon-and-label navigation on desktop, a compact icon rail on tablet, and five bottom tabs on a phone. A top bar carries the identity chips. **Design only the scrolling content column.** A screen that draws its own sidebar or its own tab bar is wrong, no matter how good it looks.

The column itself is fixed too:

```jsx
<article className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-8 sm:py-10">
    <header>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Wallet
      </h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
        One sentence.
      </p>
    </header>
    {/* sections */}
  </div>
</article>
```

`max-w-4xl` is the default measure; `max-w-6xl` is the wide variant for a screen that genuinely has two columns of content. The page scrolls itself — the window does not — so a sticky element inside the column sticks to the column.

### The four widths

Screens are checked at **1440, 768, 390 and 320**. `sm:` (640px) is the real hinge: below it, phone; above it, everything else. `lg:` is where a second column becomes affordable in the `max-w-6xl` shell.

320 is not optional and it is where layouts break. A row of three things is a column at 320. Long action labels wrap rather than clip. Nothing is allowed to overflow horizontally — check the internal scroll container, not just the viewport.

### Section rhythm

A screen is a stack of `<section>`s separated by the column's `gap-6 sm:gap-8`, each labelled for assistive tech and headed in the display face:

```jsx
<section aria-label="Activity" className="flex flex-col gap-3">
  <h2 className="font-display text-lg font-semibold">Activity</h2>…
</section>
```

The hero section of a page may carry its own surface (`bg-card shadow-card rounded-2xl border p-4 sm:p-8`); the sections under it usually sit directly on the paper. Do not put every section in a card — the warmth of the background is part of the design, and a page of stacked white boxes loses it.

### Say who is driving

This is an agentic product, and the DS carries one visual language for it: **amber is the agent, blue is the person** — `bg-drive-agent`, `bg-drive-human` and their `-soft` pairs, `DrivingRing`, `DrivingDot`, `Marker`. Any screen showing something that was done, is being done, or could be done by the agent should say so in that language rather than in prose alone. A screen with no driving colour anywhere is usually a screen that forgot the agent exists.

### Money and machine facts

- Every amount gets `text-money`, and every amount that can change gets `tabular-nums` so it does not jitter. `MorphText` animates a figure into its next value.
- Ids, hashes, addresses and transaction refs get `text-machine`. Truncate them with a real shortener, keep the full value in `title`, and put a copy affordance next to anything a person might need to paste.
- A balance that the chain has not answered for is **unavailable**, never zero, and never silently dropped from a total.

### The states are the design

Design every screen in its **empty, populated, loading and refused** states, not just the happy one. In this product the empty state is what a first-time visitor and a live demo actually see, so it carries more weight than usual — an `Empty` block sized to its content, saying what will appear here and how to make that happen, beats a large dashed rectangle saying "nothing yet".

Refusals are the product working. A refused spend gets the `stamp-refused` treatment on a `Ticket`, not a red error box.

Receipts are always `Ticket` / `TicketBody` / `TicketPerforation` / `TicketStub` — the body for the person, the stub for whoever checks. Never a plain `Card`.

### Controls

Anything tappable is at least `min-h-11`. Primary and secondary actions sit in a `flex flex-wrap gap-2` row that becomes a column at 320 on its own. Icons inside controls carry `data-icon="inline-start"` or `"inline-end"`.

### Stay inside the shipped vocabulary

`styles.css` is a compiled snapshot, not all of Tailwind. It carries every DS token, every custom utility above, the classes the product already uses, and a safelisted layout floor (grid tracks, spacing, type steps, flex and position families at `sm:` / `md:` / `lg:`, and `/5`–`/90` opacity on the semantic colours). That is a lot, but it is finite: **an exotic utility that nothing in the system uses will not exist**, and the element will render unstyled. When you need something outside it, compose from what is there or use an inline `style` — do not invent a class name and hope.
