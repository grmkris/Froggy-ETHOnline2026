/**
 * Which URLs the agent may send this server, or its Chrome, towards.
 *
 * The agent browses the open web and pays 402s on it, and both of those are
 * outbound requests from a container that can also reach a cloud metadata
 * address, a database on the private network, and itself. A prompt injection
 * that steers a URL is the cheapest attack there is, so the check is pure,
 * shared, and applied before anything is sent: `http(s)` only, no embedded
 * credentials, and no host that names the private network by literal or by
 * convention. DNS is the caller's job — a public name can still resolve to a
 * private address, and `apps/server/src/outbound.ts` checks what it resolves to.
 */

interface PublicUrlOk {
  readonly ok: true;
  readonly url: URL;
}

interface PublicUrlRefused {
  readonly ok: false;
  readonly reason: string;
}

export type PublicUrlCheck = PublicUrlOk | PublicUrlRefused;

const ipv4 = (host: string): readonly number[] | null => {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
};

/** RFC 1918, loopback, link-local (the metadata address lives there), CGNAT, this-host, multicast. */
const privateIpv4 = (octets: readonly number[]): boolean => {
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

/**
 * Is this IP literal inside the private network?
 *
 * IPv6 is matched on its prefixes: loopback, unspecified, unique-local
 * (`fc00::/7`), link-local (`fe80::/10`), and a v4 address carried inside a
 * v6 one, which is checked as the v4 address it is.
 */
export const isPrivateAddress = (ip: string): boolean => {
  const bare = ip.replaceAll(/^\[|\]$/gu, "").toLowerCase();
  const octets = ipv4(bare);
  if (octets !== null) {
    return privateIpv4(octets);
  }
  if (bare.startsWith("::ffff:")) {
    const inner = ipv4(bare.slice("::ffff:".length));
    return inner === null ? true : privateIpv4(inner);
  }
  return (
    bare === "::1" ||
    bare === "::" ||
    bare.startsWith("fc") ||
    bare.startsWith("fd") ||
    bare.startsWith("fe8") ||
    bare.startsWith("fe9") ||
    bare.startsWith("fea") ||
    bare.startsWith("feb")
  );
};

/** Names that mean "this machine" or "this network" by convention. */
export const isPrivateHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    isPrivateAddress(host)
  );
};

export const publicHttpUrl = (
  input: string,
  options: { readonly allowPrivate?: boolean } = {}
): PublicUrlCheck => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "not a URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `${url.protocol} is not http or https` };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "URLs with embedded credentials are refused" };
  }
  if (url.hostname === "") {
    return { ok: false, reason: "no host" };
  }
  if (options.allowPrivate !== true && isPrivateHostname(url.hostname)) {
    return {
      ok: false,
      reason: `${url.hostname} is on the private network, which the agent may not reach`,
    };
  }
  return { ok: true, url };
};
