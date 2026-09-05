/**
 * URL patterns Chrome itself refuses to fetch inside the agent's browser.
 *
 * The agent may browse the open web; it may not browse *this* network. A page
 * that redirects to a link-local metadata address, or a subresource that
 * probes `localhost`, would otherwise reach whatever the container can — and a
 * check on the URL the agent was told to open cannot see a redirect or an
 * `<img>` tag. `Network.setBlockedURLs` is enforced by Chrome for every request
 * a tab makes, which is the layer that can.
 *
 * Wildcards are Chrome's own: `*` matches any run of characters, including
 * none. DNS rebinding through a public name is out of scope and stated in
 * docs/decisions/0006.
 */
export const PRIVATE_URL_PATTERNS: readonly string[] = [
  "*://localhost*",
  "*://*.localhost*",
  "*://0.0.0.0*",
  "*://127.*",
  "*://10.*",
  "*://169.254.*",
  "*://192.168.*",
  "*://172.16.*",
  "*://172.17.*",
  "*://172.18.*",
  "*://172.19.*",
  "*://172.2?.*",
  "*://172.30.*",
  "*://172.31.*",
  "*://[::1]*",
  "*://[fc*",
  "*://[fd*",
  "*://[fe80*",
  "*://*.internal*",
  "*://metadata.google.internal*",
];
