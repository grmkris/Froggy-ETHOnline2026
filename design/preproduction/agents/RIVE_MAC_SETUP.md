# Rive on the Mac — setup and smoke test

**Owner:** you, on the Mac · **Prepared:** 10 September 2026 · **Prerequisite:** none spent

You confirmed a Mac at Gate A, so Rive is back in the toolchain as the branded-animation authoring seat. This is the runbook for that machine. **Nothing here requires a purchase.** Editing is provable on the free plan; export is a separate, later approval — see the Export section, which is where the money is.

A note on why this document exists rather than a paragraph of advice: Rive's MCP is a loopback server. `127.0.0.1:9791` means _the machine running the editor_. Nothing on netcup can reach it, so netcup cannot verify any of this for you. The Mac agent has to run its own proof, and this is that proof, written so its result is unambiguous.

## Step 0 — the documentation contradicts itself; resolve it by probing

Rive's MCP page says both _"Install the latest version of the Rive desktop app for Mac or Windows"_ (linking `rive.app/downloads`) **and** _"For the Rive server to be available, you must have the Rive Early Access app opened."_ The brief flagged this exact mix of latest-desktop and Early Access wording.

Do not try to settle it by reading. Install from `rive.app/downloads`, open the app, and run the probe in Step 2. If the port is dead, install the Early Access channel and probe again. The port is the authority.

## Step 1 — install and open

> **Step / purpose:** get a Rive editor running on the Mac with its MCP server listening.
>
> **Already done (from netcup):** confirmed Rive's MCP is desktop-only on macOS/Windows, confirmed the endpoint is `http://127.0.0.1:9791/mcp`, confirmed nothing listens on that port here and that this host has no graphical session, and priced every plan tier.
>
> **Your action:** on the Mac — download from `rive.app/downloads`, install, sign in, and **leave the app open**. Create a new empty file called `froggy-mcp-probe` so the smoke test has a disposable target and never touches real work.
>
> **Success looks like:** the Rive editor is open with an empty artboard on screen.
>
> **Then:** run Step 2's probe, in a terminal on the Mac.

## Step 2 — probe before registering anything

Run this **on the Mac**, not here:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9791/mcp
```

- A status code (`200`, `400`, `404`, `406` — any number) means **the server is listening**. Go to Step 3.
- `curl: (7) Failed to connect` means nothing is listening. The app is closed, or this is the channel problem from Step 0 — install Early Access and probe again.

Register the server only after the probe answers. A `claude mcp add` against a dead port creates an entry that fails on every session start, which is how a toolchain acquires a server nobody can remove because nobody remembers what it was for.

## Step 3 — register, at the right scope

```sh
claude mcp add --transport http rive http://127.0.0.1:9791/mcp
```

Two things to get right, because both are easy to get wrong and annoying to undo:

- **Run it on the Mac.** Registering `127.0.0.1:9791` in this netcup session would point at this host's own loopback, where there is no editor. It would never connect.
- **Choose the scope deliberately.** Default scope is fine for a personal machine. Do not add it to a repository-level `.mcp.json` — this repo deliberately has none, and every other agent on every other host would inherit a server that cannot work for them.

Then `claude mcp list` on the Mac should show `rive` connected, and `claude mcp list` here should still show ten servers with no `rive`. Both halves matter.

## Step 4 — the smoke test, in the disposable file

Do this in `froggy-mcp-probe`, never in a real Froggy file. **Discover the tool schemas first and use the names they return** — do not guess operation names from these descriptions. Record for each step whether the agent did it or you did it by hand; a step you completed manually is not evidence the MCP can do it.

| # | Step | Passes when |
| --- | --- | --- |
| 1 | List the available Rive tools | The client returns a schema list, not an error |
| 2 | Inspect the artboard | Name and dimensions come back and match what is on screen |
| 3 | Create a simple shape | It appears in the editor without you touching the canvas |
| 4 | Animate one property | A timeline exists with keyframes at two different times |
| 5 | Add an application-controlled behaviour | A state machine or data-bound input exists and is named |
| 6 | Render a visible preview | You can see it move |
| 7 | Save, close, reopen | Everything from 3–5 survived the round trip |

Step 7 is the one people skip. An edit that does not survive reopening is not an edit.

If any step fails, stop and record which one and the exact error. A partial pass is a useful result — "editing verified through step 4, state machine creation unavailable" is worth more than a green tick that hides where the tool stopped.

## Step 5 — export, and the plan trap

**Test export separately, and do not buy anything before we have looked at the result.**

From Rive's pricing page, read 10 September 2026:

| Plan | Price | `.riv` runtime | `.rev` editable backup |
| --- | --- | --- | --- |
| Free | $0/seat/mo, 3 collaborative files | **no** | **no** |
| Cadet | $9/seat/mo, max 3 seats | yes | **no** |
| Voyager | $32/seat/mo, max 25 seats | yes | yes |

The trap: the brief requires the editable source **and** a backup preserved separately from the runtime file. Cadet gives you a `.riv` you cannot back up as an editable artifact, so doing it strictly by the book means Voyager at **$32/seat/month**.

Before paying that, two things are worth weighing, and I would rather you saw them than had me decide:

1. Rive's cloud file _is_ the editable source on a paid plan. If the project lives in Rive and only the runtime ships to the repo, Cadet at $9 may be sufficient and `.rev` becomes a disaster-recovery nicety rather than the source of truth. That is a judgement about how much you trust a vendor to hold the master, not a technical fact.
2. If the smoke test only reaches step 4, the tool is not yet earning either price.

So the sequence is: prove editing on **Free**, report exactly how far it got, then decide. On Free you can edit through MCP and ship nothing, which is the "editing verified; export blocked" state the brief explicitly anticipates — a legitimate, honest outcome, not a failure.

## Step 6 — what netcup does with the result

Export is only half a pipeline. Once a `.riv` exists, send it here and this host will:

- load it in the isolated preview and drive the state machine through every contract state,
- measure file size and actual rendering behaviour rather than eyeballing smoothness,
- test rapid transitions, re-entry, stopping, load failure and the static fallback,
- check the compact sizes at 24 and 32 px and the large placements at 64 and 128 px,
- confirm reduced motion and offscreen behaviour.

Passing the MCP handshake is not a passing pipeline, and neither is a file that exports. The pipeline passes when the asset loads in the preview and its behaviour can be triggered.

## Before you open the editor

`motion/MOTION_CONTRACT.md` specifies the five states, the naming, the triggers and the transition rules. Read it first. It exists so the Mac session builds the contract the app will actually consume instead of exploring, and so the same specification governs the SVG fallback if export stays blocked.

One writer per Rive file at a time. Separate terminal panes do not prevent editor conflicts.
