# Capabilities and watchlist monitoring

Date: 2026-09-13

Froggy's tool definitions previously diverged by execution surface. Email tools were mistakenly returned inside a purchased service result, and paid browser turns selected only six tools. A successful model termination could therefore be recorded as done even when the requested signup never began.

Tool selection and execution now use a capability catalogue. Delegated runs retain their initiating connection and resolve its current permissions at each operation, including attachment conversion. New watchlist, automation and notification scopes are opt-in; existing grants and legacy tokens gain no new access. The CLI offers `--all-tools` for one consent flow over the supported scope catalogue, while optional `--scopes` accepts only that fixed catalogue. Scheduled prompts retain their initiating connection and require explicit email permissions in their saved action. A task report distinguishes completion, blockers and incomplete work from execution status.

Saving defaults to a monitoring setup flow, with an explicit save-only exit. The owner chooses cadence, exact item context and alert condition. Existing items are enrolled only after the owner reviews defaults. Saving and monitor configuration share owner-scoped services across chat, the web UI and MCP.

Monitoring has a separate monthly cap, initially zero, which only the human can change. The owner's timezone defines calendar months and becomes fixed after the first reservation. Each check reserves up to $1 under one PostgreSQL advisory transaction lock. Reservations and actual charges remain distinct; uncertain payments retain their reservation. The existing wallet mandate still decides whether any purchase may proceed. Background quote payments never count as the human pressing Pay.

Token price checks prefer the existing token inspection service. Other checks purchase an existing bounded browser task, with monitoring's read-only tool set and no website purchases or trading tools. The first observation establishes a baseline; later matching transitions produce alerts. Unknown data does not become a price or a successful comparison.

Human browser activity takes priority. Login, CAPTCHA and required decisions pause work; the stored task and remaining purchased allowance are reused on continuation. Idle browser resources are released while the persistent profile survives. Monitoring check records retain observations, costs and blockers independently of browser and HTTP connections.

General scheduled prompts still have no browser. Background Chrome is confined to the dedicated monitoring workflow. Email sending remains a human approval action; no tool can approve, send, raise a cap, or change a grant.

This release preserves the hosted-browser executor and progress UI introduced in decision 0031. Delegated tasks, email requests and unattended monitoring use the tool-enabled Froggy loop so required capabilities are not silently omitted. Task results keep their reported goal outcome through the shared progress view. The ongoing wallet-stream integration remains in the original shared checkout, outside this release.
