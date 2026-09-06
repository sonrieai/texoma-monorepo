# NexHealth warehouse sync schedule

The dashboard reads **MongoDB only**. NexHealth data must be synced on a schedule (or manually).

## Options

| Method | When | Best for |
|--------|------|----------|
| **Vercel Cron** | Daily **12:00 UTC** (~6 AM CST) | Production on Vercel |
| **Windows Task Scheduler** | Daily (configurable) | Dev machine or on-prem runner |
| **Settings UI** | On demand | Logged-in admins → Settings → Data sync |
| **Manual CLI** | On demand | Local development |
| **HTTP trigger** | On demand | CI, webhooks, cron services |

## 1. Vercel Cron (24 hr)

Configured in [`vercel.json`](../vercel.json):

```json
"crons": [{ "path": "/api/sync/nexhealth", "schedule": "0 12 * * *" }]
```

**Setup (Production env on Vercel):**

1. `SYNC_NEXHEALTH_ENABLED=true`
2. `SYNC_SECRET` — long random string
3. `CRON_SECRET` — same as `SYNC_SECRET` **or** a separate value
4. `MONGODB_URI`, `NEXHEALTH_*` — same as dashboard

Vercel sends `GET /api/sync/nexhealth` with `Authorization: Bearer <CRON_SECRET>`.

**Verify (no sync run):**

```powershell
curl "https://texoma.vercel.app/api/sync/nexhealth/status" `
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

**Manual trigger (same as cron):**

```powershell
curl "https://texoma.vercel.app/api/sync/nexhealth" `
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Change the schedule in `vercel.json` (cron syntax, UTC). Example: `0 6 * * *` = 06:00 UTC daily.

> Vercel Cron requires a deployed project. Hobby/Pro limits apply — see [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## 2. Windows Task Scheduler (24 hr)

From repo root, with `.env.local` containing `SYNC_SECRET` and app URL:

```powershell
.\scripts\schedule-nexhealth-sync.ps1 -Register
```

Default: daily at **6:00 AM** local time, hits `http://localhost:5001/api/sync/nexhealth` (dev) or set `-BaseUrl https://texoma.vercel.app` for production.

```powershell
.\scripts\schedule-nexhealth-sync.ps1 -Register -BaseUrl "https://texoma.vercel.app" -At "06:00"
```

Remove the task:

```powershell
.\scripts\schedule-nexhealth-sync.ps1 -Unregister
```

## 3. Manual CLI

```powershell
npm run sync:nexhealth        # incremental (uses sync_state cursors)
npm run sync:nexhealth:full   # wider backfill window
```

## 4. HTTP API

| Endpoint | Method | Auth | Action |
|----------|--------|------|--------|
| `/api/sync/nexhealth` | GET or POST | `x-sync-secret`, `?secret=`, or `Bearer` | Run sync |
| `/api/sync/nexhealth/status` | GET | same | Last sync time + errors only |

All sync routes skip login middleware; secret is required.

## Environment

| Variable | Purpose |
|----------|---------|
| `SYNC_NEXHEALTH_ENABLED` | Set `false` to disable HTTP/cron sync |
| `SYNC_SECRET` | Manual + Task Scheduler auth |
| `CRON_SECRET` | Vercel Cron Bearer token (optional if same as SYNC_SECRET) |
| `SYNC_NEXHEALTH_MAX_PAGES` | Cap NexHealth pagination per resource (default 50) |

See also [DATA_ACCESS.md](./DATA_ACCESS.md).
