/**
 * The unlocked page: what the person sees after the host paid.
 *
 * The agent pays a 402 from the server, not from the shared Chrome — the
 * browser is where hostile content lives and it never holds a key. But the
 * beat the product is built around is watching the page unlock, so once a
 * paid answer is in hand the tool mints a one-time link and the agent opens
 * it in the shared browser. The page shows what was bought, what it cost,
 * and the transaction that paid for it, with the answer underneath.
 *
 * One-time and short-lived on purpose. The link carries no session and needs
 * no sign-in, because the Chrome that opens it is the worker's and has no
 * token; a link that could be opened twice, or a day later, would be a way
 * to read a paid answer out of a browser history.
 */

import type { UserId } from "@froggy/domain";

export interface UnlockedPurchase {
  /** Human-readable price, as the receipt priced it. */
  readonly amountLabel: string | null;
  readonly body: string;
  readonly hcsSequence: number | null;
  readonly network: string | null;
  readonly purpose: string;
  readonly transactionId: string | null;
  readonly url: string;
  readonly userId: UserId;
}

interface Held {
  readonly expiresAt: number;
  readonly purchase: UnlockedPurchase;
  used: boolean;
}

export type Unlock =
  | { readonly kind: "expired" }
  | { readonly kind: "open"; readonly purchase: UnlockedPurchase }
  | { readonly kind: "used" };

const DEFAULT_TTL_MS = 10 * 60 * 1000;

const tokenBytes = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");

export class UnlockTokens {
  private readonly held = new Map<string, Held>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(
    options: { readonly now?: () => number; readonly ttlMs?: number } = {}
  ) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  /** A fresh link's token. Expired ones are swept while we are here. */
  mint(purchase: UnlockedPurchase): string {
    const at = this.now();
    for (const [token, entry] of this.held) {
      if (entry.expiresAt <= at) {
        this.held.delete(token);
      }
    }
    const token = tokenBytes();
    this.held.set(token, { expiresAt: at + this.ttlMs, purchase, used: false });
    return token;
  }

  /** Open the link. The first call gets the page; every later one gets "used". */
  take(token: string): Unlock {
    const entry = this.held.get(token);
    if (entry === undefined || entry.expiresAt <= this.now()) {
      this.held.delete(token);
      return { kind: "expired" };
    }
    if (entry.used) {
      return { kind: "used" };
    }
    entry.used = true;
    return { kind: "open", purchase: entry.purchase };
  }
}

export const unlockPath = (token: string): string => `/unlocked/${token}`;

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Where a transaction can be read by anyone, per network. Null when unknown. */
const explorerLink = (
  network: string | null,
  transactionId: string
): string | null => {
  if (network === null) {
    return null;
  }
  switch (network) {
    case "hedera:testnet": {
      return `https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`;
    }
    case "eip155:84532": {
      return `https://sepolia.basescan.org/tx/${encodeURIComponent(transactionId)}`;
    }
    case "eip155:8453": {
      return `https://basescan.org/tx/${encodeURIComponent(transactionId)}`;
    }
    default: {
      return null;
    }
  }
};

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; background: #faf8f2; color: #1f2a22; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 44rem; margin: 3rem auto; padding: 0 1.25rem; }
  .stamp { display: inline-block; border: 2px solid #2f7d4f; color: #2f7d4f; border-radius: .5rem; padding: .2rem .6rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .75rem; }
  h1 { font-size: 1.6rem; margin: .75rem 0 .25rem; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 1.25rem 0; font-size: .9rem; }
  dt { color: #6b7570; }
  dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  pre { background: #fff; border: 1px solid #e6e1d3; border-radius: .75rem; padding: 1rem; overflow: auto; font-size: .85rem; }
  footer { color: #6b7570; font-size: .8rem; margin-top: 2rem; }
  a { color: #2f7d4f; }
`;

const page = (title: string, inner: string): Response =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${inner}</main></body></html>`,
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    }
  );

/** The pretty form of the body when it is JSON, else the body as it came. */
const pretty = (body: string): string => {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};

/** The transaction, linked to its explorer when one is known; escaped otherwise. */
const transactionCell = (purchase: UnlockedPurchase): string => {
  if (purchase.transactionId === null) {
    return "—";
  }
  const explorer = explorerLink(purchase.network, purchase.transactionId);
  const id = escapeHtml(purchase.transactionId);
  return explorer === null
    ? id
    : `<a href="${explorer}" rel="noreferrer">${id}</a>`;
};

export const renderUnlock = (unlock: Unlock): Response => {
  if (unlock.kind === "used") {
    return page(
      "Already opened",
      `<span class="stamp">opened</span><h1>This page was already opened</h1><p>An unlocked page opens once. The receipt in the workspace keeps what it said.</p>`
    );
  }
  if (unlock.kind === "expired") {
    return page(
      "Link expired",
      `<h1>This link has expired</h1><p>Unlocked pages last ten minutes. Ask the agent again and it will pay for a fresh one, under the same mandate.</p>`
    );
  }
  const { purchase } = unlock;
  const transaction = transactionCell(purchase);
  return page(
    "Paid and unlocked",
    `<span class="stamp">paid</span><h1>Unlocked</h1><p>${escapeHtml(purchase.purpose)}</p>
<dl>
<dt>Seller</dt><dd>${escapeHtml(purchase.url)}</dd>
<dt>Paid</dt><dd>${escapeHtml(purchase.amountLabel ?? "—")}</dd>
<dt>Network</dt><dd>${escapeHtml(purchase.network ?? "—")}</dd>
<dt>Transaction</dt><dd>${transaction}</dd>
<dt>HCS note</dt><dd>${purchase.hcsSequence === null ? "—" : `#${purchase.hcsSequence}`}</dd>
</dl>
<pre>${escapeHtml(pretty(purchase.body))}</pre>
<footer>Paid by Froggy from the wallet's pocket, under the mandate you set. This page opens once and expires in ten minutes; the receipt in the workspace is the durable record.</footer>`
  );
};
