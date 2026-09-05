# Railway configuration

Froggy's Railway infrastructure is code: `.railway/railway.ts`, applied with the `railway` CLI that is a devDependency of this repository. One project (`froggy`), one environment (`production`), one public service (`app`) and one Postgres.

## Commands

```bash
bunx railway config plan    # safe: shows what would change, changes nothing
bunx railway config apply   # previews, then asks before applying
```

Run the CLI under node (`bunx railway`, not `bunx --bun railway`): its IaC evaluator does not run under Bun's node compatibility layer yet. `RAILWAY_API_TOKEN` comes from `~/.config/secrets.env` on the build box.

## Rules

- Every variable the service needs is listed as `preserve()` in `railway.ts`. A variable that is not listed is **deleted** on apply, so adding a variable to the app means adding it there first. Secret values never appear in source.
- `checkSuites: true`: a deploy waits for the Actions run on the pushed sha and is skipped when it fails. So CI must run on every sha (no `paths-ignore`), or the deploy hangs in WAITING.
- `preDeployCommand` is one shell string. Railway rejects a multi-element argv, and only at apply time.
- Exactly one replica. The per-user promise chains, the parked approvals and the Chrome workers are per process.
- No `VOLUME` in the Dockerfile; Railway owns the mount and declares it here.
- Destructive changes (a smaller volume, a removed service) need `railway config apply --confirm-destructive` after reading the plan.

## Where things live on the service

| Path | What |
| --- | --- |
| `/data/profiles/<hash>` | one persistent Chrome profile per signed-in user |
| `/app/apps/web/dist` | the built SPA, served by the same process |
| `/health` | liveness, with the stub/live mode of every integration |
