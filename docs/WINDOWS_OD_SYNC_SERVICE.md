# Q2 — Windows task host for Open Dental → GoHighLevel sync

Run on the office machine that can reach Open Dental MySQL and the internet (not on Vercel).

## Prerequisites

- Node 24.x, repo clone, `.env.local` with `OD_MYSQL_*`, `GHL_*`, `OD_GHL_SYNC_STATE_PATH` pointing at `data/od-ghl-sync.json`
- `AUTH_SESSION_SECRET` only needed for the dashboard app, not for `sync:od-ghl`

## Task Scheduler (every 5 minutes)

1. Action: `npm run sync:od-ghl` with **Start in** = repo root.
2. Trigger: repeat every 5 minutes indefinitely.
3. Run whether user is logged on or not; use the service account that owns the repo.
4. First deploy: `npm run sync:od-ghl -- --dry-run` and confirm `wouldCreate` is acceptable (item 21).

## Logs

- Sync log: `data/od-ghl-sync.log` (local only — never written to GHL notes).
- Failed runs leave `lastSuccessfulRunAt` unchanged; GHL workflows should guard on stale heartbeat (item 28 spec).

## After Open Dental upgrade

Follow `docs/OFFICE_INSTALL.md` post-upgrade checklist before re-enabling the task.
