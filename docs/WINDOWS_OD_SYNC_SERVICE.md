# Q2 — Windows task host for Open Dental → GoHighLevel sync

Run on the office machine that can reach Open Dental MySQL and the internet (not on Vercel).

## Prerequisites

- Node 24.x, repo clone, `.env.local` with `OD_MYSQL_*`, `GHL_*`, `OD_GHL_SYNC_STATE_PATH` pointing at `data/od-ghl-sync.json`
- `AUTH_SESSION_SECRET` only needed for the dashboard app, not for `sync:od-ghl`

## Task Scheduler (America/Chicago)

Do **not** run the full GHL poll every 5 minutes. Split work:

| Task | Trigger | Command |
|------|---------|---------|
| Consults | every 5 minutes | `scripts\run-od-ghl-sync.cmd consults` |
| Patients | daily 03:00 | `scripts\run-od-ghl-sync.cmd patients` |
| Other appointments | daily 04:00 | `scripts\run-od-ghl-sync.cmd appointments` |
| Sold / stages | daily 05:00 | `scripts\run-od-ghl-sync.cmd sold` |
| Dashboard snapshot | daily 06:00 | `scripts\run-od-snapshot-refresh.cmd` |

Start in = repo root. Run whether the user is logged on or not.

First deploy: `npm run sync:od-ghl -- --mode=consults --dry-run` and confirm `wouldCreate` is acceptable (item 21). Repeat dry-run for the overnight modes before enabling them.

Disable the legacy combined task named `Texoma OD to GHL` if it is still registered.

## Logs

- GHL sync: `data/od-ghl-sync.log` (local only — never written to GHL notes).
- Dashboard snapshot: `data/od-snapshot-refresh.log`.
- Failed GHL runs leave that mode’s cursor and `lastSuccessfulRunAt` unchanged; GHL workflows should guard on stale heartbeat (item 28 spec).

## After Open Dental upgrade

Follow `docs/OFFICE_INSTALL.md` post-upgrade checklist before re-enabling the tasks.
