/**
 * Outbound requests the agent asked for.
 *
 * Every URL the model hands a tool is validated before anything is sent
 * (`publicHttpUrl`), but a name that passes can still resolve to the private
 * network, and a public page can redirect there. So the request goes through
 * here: the host is resolved first and refused if any answer is private,
 * redirects are followed by hand with the same check on every hop, the whole
 * thing has a deadline, and the body is capped so a hostile seller cannot
 * hand the model a gigabyte.
 *
 * DNS rebinding — a name that answers public once and private the next time —
 * is not defended here and is stated in docs/decisions/0006 rather than
 * implied away.
 */

import { isPrivateAddress, publicHttpUrl } from "@froggy/domain";

export interface OutboundOptions {
  /** Local development: the app itself is on `localhost`. */
  readonly allowPrivate?: boolean;
  /** Injected in tests. Defaults to `Bun.dns.lookup`. */
  readonly fetch?: typeof fetch;
  readonly lookup?: (hostname: string) => Promise<readonly string[]>;
  readonly maxBodyBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
}

export class OutboundRefusedError extends Error {
  constructor(reason: string) {
    super(`Refused before sending: ${reason}. Nothing was requested.`);
    this.name = "OutboundRefusedError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const systemLookup = async (hostname: string): Promise<readonly string[]> => {
  const answers = await Bun.dns.lookup(hostname);
  return answers.map((answer) => answer.address);
};

const assertPublic = async (
  target: URL,
  options: OutboundOptions
): Promise<void> => {
  if (options.allowPrivate === true) {
    return;
  }
  const lookup = options.lookup ?? systemLookup;
  let addresses: readonly string[];
  try {
    addresses = await lookup(target.hostname);
  } catch {
    throw new OutboundRefusedError(`${target.hostname} does not resolve`);
  }
  if (addresses.length === 0) {
    throw new OutboundRefusedError(`${target.hostname} does not resolve`);
  }
  const hidden = addresses.find((address) => isPrivateAddress(address));
  if (hidden !== undefined) {
    throw new OutboundRefusedError(
      `${target.hostname} resolves to ${hidden}, which is on the private network`
    );
  }
};

/**
 * Fetch a URL the model asked for, safely.
 *
 * Returns the final response with redirects already followed. Throws
 * `OutboundRefusedError` when the URL, its resolution, or a redirect target
 * is not somewhere the agent may reach.
 */
export const safeFetch = async (
  input: string,
  init: RequestInit = {},
  options: OutboundOptions = {}
): Promise<Response> => {
  const doFetch = options.fetch ?? fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowPrivate = options.allowPrivate === true;

  // Recursive rather than a loop: each hop's target is only known once the
  // previous one has answered, and a redirect chain is a list of decisions.
  const follow = async (current: string, hop: number): Promise<Response> => {
    if (hop > maxRedirects) {
      throw new OutboundRefusedError(`more than ${maxRedirects} redirects`);
    }
    const check = publicHttpUrl(current, { allowPrivate });
    if (!check.ok) {
      throw new OutboundRefusedError(check.reason);
    }
    await assertPublic(check.url, options);
    const response = await doFetch(check.url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      return response;
    }
    return await follow(new URL(location, check.url).toString(), hop + 1);
  };

  return await follow(input, 0);
};

/** The body as text, cut at the cap. A truncated body says so at the end. */
export const readCapped = async (
  response: Response,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<string> => {
  const text = await response.text();
  return text.length > maxBytes
    ? `${text.slice(0, maxBytes)}\n… (body truncated at ${maxBytes} bytes)`
    : text;
};
