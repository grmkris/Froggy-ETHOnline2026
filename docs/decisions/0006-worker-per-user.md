# 6. One browser worker process per user

Date: 2026-09-05

## Status

Accepted.

## Context

Every signed-in user gets their own Chrome, their own profile and their own screencast. `Bun.WebView` runs exactly one Chrome per process, and the first view's `dataStore` directory applies to every view created afterwards — a second user's tab opens inside the first user's profile however many `BrowserSession`s exist. It also allows one CDP command in flight per view. Two designs were on the table: replace the transport with `puppeteer-core` browser contexts in one process, or keep `Bun.WebView` and give each user a process. The owner chose to keep `Bun.WebView`.

## Decision

The server spawns one worker process per user on the first message that needs a page (`packages/browser/src/worker-host.ts`), with an explicit environment allowlist — path, home, temp dir, the Chrome override — and none of the server's secrets. The worker owns one `BrowserSession` and speaks `WorkerCommand`/`WorkerEvent` (`packages/protocol/src/worker.ts`) over Bun's IPC channel, structured-cloned so frames travel as bytes. `RemoteBrowser` (`packages/browser/src/remote.ts`) is the host's handle and implements the same `BrowserHandle` interface as the in-process session, so the tools, the sockets and the registry cannot tell which they hold.

Frames carry a credit: the worker keeps at most two in flight and drops the rest until the host acks, mirroring Chrome's own screencast policy, so a freeze command never queues behind a backlog of JPEGs. Chrome casts only while somebody is subscribed. A worker exits when its host disconnects, and releases Chrome with `Browser.close` first so the persistent profile is flushed to disk. Every tab refuses the private network through `Network.setBlockedURLs`, which covers redirects and subresources that a check on the typed URL cannot see; local development turns that off because the app itself is on `localhost`.

## Consequences

- The process that renders hostile pages holds no secret. That boundary was a lint rule between packages; it is now a process boundary as well.
- A dead worker reads as a crashed browser with the exit reason on the pane, and the next request spawns a new one on the same profile.
- Memory is roughly half a gigabyte per active user; the cap on concurrent workers and the idle sweep are configuration, not code.
- DNS rebinding through a public name is not defended and is stated here rather than implied.
- The in-process `BrowserSession` remains the unit under test; the protocol is tested end to end in memory (`worker-protocol.test.ts`), and a real spawn is proven on the deployed box, not in CI.
