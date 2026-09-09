/**
 * Outbound requests the agent asked for.
 *
 * Every URL the model hands a tool is validated before anything is sent
 * (`publicHttpUrl`), but a name that passes can still resolve to the private
 * network, and a public page can redirect there. So the request goes through
 * here: the host is resolved first and refused if any answer is private,
 * redirects stay on the original origin with the same check on every hop,
 * the whole thing has a deadline, and the body is capped while reading.
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
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;

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
    signal.throwIfAborted();
    await assertPublic(check.url, options);
    signal.throwIfAborted();
    const response = await doFetch(check.url, {
      ...init,
      redirect: "manual",
      signal,
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      return response;
    }
    await response.body?.cancel();
    const target = new URL(location, check.url);
    // The response's seller and any payment authorization must stay bound to
    // the origin the caller authorized, including on the first unpaid request.
    if (target.origin !== check.url.origin) {
      throw new OutboundRefusedError(
        `redirects from ${check.url.origin} to ${target.origin} are not allowed across origins`
      );
    }
    return await follow(target.toString(), hop + 1);
  };

  return await follow(input, 0);
};

/** The body as text, cut at the cap. A truncated body says so at the end. */
export const readCapped = async (
  response: Response,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<string> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError(
      "The response byte limit must be a non-negative integer."
    );
  }
  if (response.body === null) {
    return "";
  }
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for await (const chunk of response.body) {
    const remaining = maxBytes - size;
    if (chunk.byteLength > remaining) {
      text += decoder.decode(chunk.subarray(0, remaining), { stream: true });
      // Returning cancels the unread stream. Do not flush an incomplete UTF-8
      // character at the cut, which would invent a replacement character.
      return `${text}\n… (body truncated at ${maxBytes} bytes)`;
    }
    size += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
};

/** Stream limits apply before buffering, including media. Never follow a redirect with a credential. */
export const boundedBytes = async (
  response: Response,
  limit = 3 * 1024 * 1024
): Promise<Uint8Array> => {
  if (response.body === null) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Async iteration cancels the stream on throw, before another chunk is read.
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > limit) {
      throw new Error("Provider response exceeded the size limit.");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};
