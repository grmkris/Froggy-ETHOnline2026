/**
 * The agent's tools.
 *
 * Two rules govern this list, and both are structural rather than advisory:
 *
 *   1. **The approval channel is not a tool.** There is no `raise_limit`, no
 *      `resolve_approval`, no `unfreeze`. An agent that can approve its own
 *      spending has no leash, and a prompt telling it not to is a request, not
 *      a control. Freezing and approving arrive on the app socket, from a human.
 *   2. **Payment goes through the session, never around it.** `x402_fetch` signs
 *      nothing; it hands an intent to `session.spend`, which prices it, asks the
 *      policy, and reserves on the ledger *before* a signature is ever built. A
 *      refusal therefore happens with no key material in play at all.
 *
 * Every output is capped. An uncapped page dump once put megabytes into a
 * stream, into every later prompt, and into a replay buffer — three failures
 * from one missing `slice`.
 *
 * For any numeric input, use `Schema.Finite` and never `Schema.Number`: the
 * latter encodes as `number | "Infinity" | "NaN"`, and that union lands
 * verbatim in the JSON Schema the model reads — which invites it to send the
 * string "NaN" as an amount.
 */

import type { BrowserHandle } from "@froggy/browser";
import { KNOWN_ASSETS, publicHttpUrl } from "@froggy/domain";
import type { Evidence } from "@froggy/domain";
import {
  describeCheapestBorrow,
  describeDeployments,
  snapshotHash,
} from "@froggy/graph";
import {
  decodePaymentChallenge,
  decodeSettlementHeader,
} from "@froggy/payments";
import { tool } from "ai";
import { Schema } from "effect";

import { OutboundRefusedError, readCapped, safeFetch } from "./outbound";
import type { ChatRun } from "./runs";
import type { Services } from "./services";
import { MalformedSpendError, UnpricedAssetError } from "./session";
import type { SpendResult, WorkspaceSession } from "./session";
import { std } from "./std";

const OUTPUT_CAP = 50_000;

/**
 * Truncate without splitting a surrogate pair.
 *
 * A lone surrogate is invalid UTF-8 and some providers reject the entire
 * request over one — an obscure thing to debug when the trigger is "the page
 * happened to contain an emoji at character fifty thousand".
 */
export const cap = (text: string, limit = OUTPUT_CAP): string => {
  if (text.length <= limit) {
    return text;
  }
  // `codePointAt` returns a value above 0xFFFF only when the unit at that index
  // begins a surrogate pair — which means cutting at `limit` would keep the
  // lead half and drop its trail. Back up one so the pair leaves together.
  const straddles = (text.codePointAt(limit - 1) ?? 0) > 0xff_ff;
  const cut = straddles ? limit - 1 : limit;
  return `${text.slice(0, cut)}\n… (truncated at ${limit} characters)`;
};

export interface ToolDeps {
  /** This caller's own Chrome. One per signed-in user, never shared. */
  readonly browser: BrowserHandle;
  readonly run: ChatRun;
  readonly services: Services;
  readonly session: WorkspaceSession;
}

/**
 * Turn a spend into something the model can act on.
 *
 * A policy refusal is returned as a tool *result*, never thrown: a thrown
 * error reads to the model as a transient failure worth retrying, and a
 * refusal is the opposite of that — it is the final answer. An unpriced asset
 * is a third thing again, and says so: "the policy said no" and "the policy
 * could not be evaluated" are different facts, and only one of them means the
 * agent should stop asking.
 */
const explainSpend = async (
  attempt: Promise<SpendResult>
): Promise<{
  readonly message: string | null;
  readonly result: SpendResult | null;
}> => {
  let result: SpendResult;
  try {
    result = await attempt;
  } catch (error) {
    if (
      error instanceof UnpricedAssetError ||
      error instanceof MalformedSpendError
    ) {
      return { message: error.message, result: null };
    }
    throw error;
  }
  if (result.abandoned !== null) {
    return {
      message: `Allowed by policy, but not sent: ${result.abandoned}. Stop here.`,
      result,
    };
  }
  if (result.decision._tag === "deny") {
    return {
      message: `Refused by policy (${result.decision.code}): ${result.decision.message}`,
      result,
    };
  }
  if (result.decision._tag === "ask") {
    return {
      message: `This spend is over the automatic limit and needs the human: ${result.decision.question}`,
      result,
    };
  }
  return { message: null, result };
};

export const buildTools = (deps: ToolDeps) => {
  const { browser, services, session } = deps;
  /** Per-turn, because `buildTools` is called once per turn. Not module state. */
  let lastEvidence: Evidence | undefined;
  // Local development runs the app on `localhost`, and the oracle the agent
  // must reach is on it too. Everywhere else the private network is off limits.
  const outbound = { allowPrivate: !services.environment.blockPrivateNetwork };

  return {
    browser_navigate: tool({
      description:
        "Open a URL in the shared browser. The human is watching this exact page and can take it from you at any moment — narrate what you are doing.",
      execute: async ({ url }) => {
        // Checked here, in the tool, so the model reads a refusal rather than
        // a thrown error, and before the worker is asked anything.
        const check = publicHttpUrl(url, outbound);
        if (!check.ok) {
          return `Refused: ${check.reason}. The browser opens public http(s) pages only.`;
        }
        await browser.agentNavigate(check.url.toString());
        const { snapshot } = await browser.agentSnapshot();
        return cap(snapshot.text);
      },
      inputSchema: std(
        Schema.Struct({
          url: Schema.String.annotate({
            description: "An absolute http(s) URL.",
          }),
        })
      ),
    }),

    browser_snapshot: tool({
      description:
        "Read the current page as an accessibility tree with @eN refs you can click.",
      execute: async () => {
        const { snapshot, wait } = await browser.agentSnapshot();
        // The model is told when the human was mid-interaction: a snapshot taken
        // during a click may describe a page that has already moved on, and
        // acting on it silently is how an agent clicks the wrong thing.
        const note =
          wait === "timeout"
            ? "\n\n[the human was still interacting when this was taken; it may be stale]"
            : "";
        return cap(`${snapshot.text}${note}`);
      },
      inputSchema: std(Schema.Struct({})),
    }),

    browser_click: tool({
      description: "Click an @eN ref from the most recent snapshot.",
      execute: async ({ ref }) => {
        const result = await browser.agentClick(ref);
        return result.note;
      },
      inputSchema: std(
        Schema.Struct({
          ref: Schema.String.annotate({ description: "A ref such as @e12." }),
        })
      ),
    }),

    browser_type: tool({
      description: "Type text into the focused element on the page.",
      execute: async ({ text }) => {
        await browser.agentType(text);
        return `Typed ${text.length} characters.`;
      },
      inputSchema: std(Schema.Struct({ text: Schema.String })),
    }),

    graph_query: tool({
      description:
        "Live lending markets across four pinned Graph deployments — Aave v3 on Ethereum and Base, Compound v3, Spark — read with one standardized query and returned cheapest borrow first. Each answer says which indexes were fresh and at what block. This is the evidence a spend has to be justified by; query it before you pay for anything derived from it.",
      execute: async ({ symbol }) => {
        const snapshot = await services.graph.lendingMarkets(symbol);
        // Held so a payment made right after a query can cite what it was
        // acting on, rather than the receipt saying only that money moved.
        lastEvidence = {
          deployments: snapshot.deployments.map((deployment) => ({
            blockNumber: deployment.blockNumber,
            id: deployment.id,
            label: `${deployment.label} (${deployment.chain})`,
            status: deployment.status,
          })),
          query: snapshot.query,
          snapshotHash: snapshotHash(snapshot),
          source: snapshot.source,
          stubbed: snapshot.stubbed,
        };
        const stub = snapshot.stubbed
          ? "\n\n[STUB: recorded fixture, not a live Graph provider. Say so if you cite it.]"
          : "";
        return cap(
          `${describeCheapestBorrow(snapshot)}\n\n${describeDeployments(snapshot)}${stub}`
        );
      },
      inputSchema: std(
        Schema.Struct({
          symbol: Schema.String.annotate({
            description: "Token symbol, for example USDC.",
          }),
        })
      ),
    }),

    x402_fetch: tool({
      description:
        "Fetch a URL that may require payment. If it answers 402 the payment is made under the user's mandate. You do not decide whether it is allowed and you cannot raise the limit.",
      execute: async ({ url }) => {
        const check = publicHttpUrl(url, outbound);
        if (!check.ok) {
          return `Refused before sending: ${check.reason}. Nothing was requested.`;
        }
        const target = check.url;
        // Checked before the request, not after it. The old order fetched the
        // model's URL first and consulted the policy only once a 402 came
        // back — so a prompt injection could make this server issue an
        // arbitrary outbound request, and the refusal arrived long after the
        // request had already been sent. The allowlist was always the control;
        // asking it first is what makes it one.
        if (!session.allowsHost(target.host)) {
          return `Refused before sending: ${target.host} is not on the mandate's list of hosts this agent may pay. Nothing was requested.`;
        }
        let first: Response;
        try {
          first = await safeFetch(url, {}, outbound);
        } catch (error) {
          if (error instanceof OutboundRefusedError) {
            return error.message;
          }
          throw error;
        }
        if (first.status !== 402) {
          return cap(await readCapped(first));
        }

        // SAFETY: a 402 body is the x402 `PaymentRequired` envelope by
        // specification. Only `accepts[0]`'s three fields are read here, and
        // the payer re-selects a requirement it can actually satisfy before
        // signing anything.
        // Decoded, not asserted: this is a *seller* telling the agent what to
        // pay and where to send it. The host allowlist is what stops us
        // reaching a hostile one; this is what stops a malformed reply from
        // becoming a payment with `undefined` in it.
        const decoded = decodePaymentChallenge(await first.json());
        if (decoded._tag === "Failure") {
          return "That server asked for payment but its 402 did not carry usable requirements.";
        }
        const challenge = decoded.success;
        const [requirement] = challenge.accepts;
        if (requirement === undefined) {
          return "The server asked for payment but offered no requirements.";
        }

        let paidBody: string | null = null;
        const request: Parameters<typeof session.spend>[0] = {
          amount: {
            asset: {
              decimals: 8,
              id: requirement.asset,
              network: "hedera:testnet",
              symbol: requirement.asset === "0.0.0" ? "HBAR" : "HTS",
            },
            units: requirement.amount,
          },
          host: target.host,
          // Stable across retries of the same logical purchase, so an SDK retry
          // or a reconnect cannot pay twice for one decision.
          idempotencyKey: `x402:${url}:${requirement.amount}`,
          payeeId: requirement.payTo,
          payeeLabel: `${target.host} (x402)`,
          // `server`, because the payee came out of a 402 challenge from a host
          // that is itself on the mandate's allowlist — not out of page text
          // and not out of the model.
          provenance: "server",
          purpose: `x402 payment for ${target.pathname}`,
          runId: deps.run.id,
          signal: deps.run.signal,
          settle: async () => {
            const attempt = await services.payer.pay(challenge);
            if (attempt.header === null) {
              return {
                network: "hedera:testnet",
                ok: false,
                stubbed: attempt.stubbed,
                transactionId: null,
              };
            }
            const paid = await safeFetch(
              url,
              { headers: { "x-payment": attempt.header } },
              outbound
            );
            paidBody = await readCapped(paid);
            // The settlement comes back as x402's base64 envelope; an older
            // seller's bare id is accepted too. Neither is trusted as more
            // than a transaction reference for the receipt.
            const settlement = decodeSettlementHeader(
              paid.headers.get("x-payment-response")
            );
            return {
              network: settlement?.network ?? "hedera:testnet",
              ok: paid.ok,
              stubbed: attempt.stubbed,
              transactionId: settlement?.transactionId ?? null,
            };
          },
        };
        if (lastEvidence !== undefined) {
          // The Graph answer this purchase is justified by, so the receipt can
          // say what the agent was acting on and not merely that it paid.
          request.evidence = lastEvidence;
        }
        const { message } = await explainSpend(session.spend(request));
        if (message !== null) {
          return message;
        }
        return cap(paidBody ?? "Paid, but the server returned no body.");
      },
      inputSchema: std(Schema.Struct({ url: Schema.String })),
    }),

    wallet_send: tool({
      description:
        "Send stablecoins to an address. The mandate decides whether it happens — you cannot raise a limit or add a payee, and an address you read on a page or produced yourself will be refused.",
      execute: async ({ amountUsd, purpose, to }) => {
        const attempt = session.spend({
          amount: {
            asset: KNOWN_ASSETS["eip155:84532:usdc"],
            units: String(Math.round(amountUsd * 1_000_000)),
          },
          idempotencyKey: `send:${to}:${amountUsd}:${deps.run.id}`,
          payeeId: to,
          payeeLabel: to,
          // `model`, always. This is the whole jailbreak demo: an address the
          // model produced is refused on provenance before any cap is even
          // consulted, however well-formed it looks and however convincingly
          // the prompt asked. Putting it on the mandate's allowlist is the only
          // way through, and only a human can do that.
          provenance: "model",
          purpose,
          runId: deps.run.id,
          signal: deps.run.signal,
          settle: async () => {
            await Promise.resolve();
            // Unreachable while provenance is `model`. It exists so the shape
            // is right the day a mandate-listed payee is sent to.
            return {
              network: "eip155:84532",
              ok: false,
              stubbed: true,
              transactionId: null,
            };
          },
        });

        const { message } = await explainSpend(attempt);
        if (message !== null) {
          return message;
        }
        return "Allowed by policy, but transfers are not wired to a signer yet.";
      },
      inputSchema: std(
        Schema.Struct({
          amountUsd: Schema.Finite.annotate({
            description: "Amount in USDC, as a decimal number.",
          }),
          purpose: Schema.String.annotate({
            description: "What this pays for, in a few words.",
          }),
          to: Schema.String.annotate({
            description: "Recipient address.",
          }),
        })
      ),
    }),

    wallet_status: tool({
      description:
        "The user's wallet and the mandate you operate under: caps, allowlists, and what has been spent so far.",
      execute: async () => {
        const summary = await session.walletSummary();
        const mandate = session.currentMandate;
        return cap(
          JSON.stringify(
            {
              address: summary.address,
              frozen: mandate.frozen,
              rules: mandate.rules,
              windowSpentUsdMicros: summary.windowSpentUsdMicros,
            },
            null,
            2
          )
        );
      },
      inputSchema: std(Schema.Struct({})),
    }),
  };
};
