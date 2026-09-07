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
