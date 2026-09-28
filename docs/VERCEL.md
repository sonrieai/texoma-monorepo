# Deploy on Vercel

This app is a **single Next.js 16 project** — UI pages and API Route Handlers (`/api/*`) deploy together on one Vercel project. There is no separate backend service.

Config in repo: [`vercel.json`](../vercel.json).

## When Vercel is appropriate

Vercel can host the UI + auth when **Open Dental MySQL is reachable** from
Vercel (public replica, VPN/tunnel, or similar). For a typical **office-only**
MySQL on the dental server, use the LAN install instead:
[OFFICE_INSTALL.md](./OFFICE_INSTALL.md).

| Host | Clinical MySQL | Login (Mongo) |
|------|----------------|---------------|
| Office LAN (`start:lan` :8080) | Same machine / LAN | Atlas |
| Vercel | Only if MySQL is reachable from the internet/tunnel | Atlas |

## Vercel project

| Field | Value |
|-------|-------|
| Team | Sonrie (`sonrie`) |
| Project | `texoma-monorepo` |
| Production URL | https://texoma.vercel.app |
| Login | https://texoma.vercel.app/login |
| Git repo | `sonrieai/texoma-monorepo` |
| Dashboard | https://vercel.com/sonrie/texoma-monorepo |

## Before first deploy

1. Push this repo to GitHub (already linked to Vercel).
2. **Do not** commit `.env.local` (gitignored).
3. Add environment variables in Vercel (**Project → Settings → Environment Variables**) for **Production** and **Preview**:

| Variable | Required | Notes |
|----------|----------|-------|
| `OD_MYSQL_HOST` | Yes* | Open Dental MySQL host reachable from Vercel (*or use office LAN instead) |
| `OD_MYSQL_PORT` | Yes* | Usually `3306` |
| `OD_MYSQL_USER` | Yes* | SELECT-only user (e.g. `kpi_readonly`) |
| `OD_MYSQL_PASS` | Yes* | |
| `OD_MYSQL_DB` | Yes* | e.g. `opendental` |
| `MONGODB_URI` | Yes | Atlas — **login + GHL settings only** (not clinical KPIs) |
| `MONGODB_DB` | Yes | e.g. `texoma` |
| `AUTH_SESSION_SECRET` | Yes (≥32 chars) | Required for Vercel production builds |
| `PASSWORD_RESET_WEB_BASE_URL` | Recommended | `https://texoma.vercel.app` |
| `GHL_API_KEY` | Optional | GoHighLevel |
| `GHL_LOCATION_ID` | Optional | GoHighLevel |
| `GHL_BASE_URL` | Optional | GoHighLevel |

Without `OD_MYSQL_*` reachable from the host, Overview and KPI pages cannot
load clinical data. Without `MONGODB_URI`, dashboard login fails.

## CLI: push env from `.env.local`

After `npx vercel login` and linking the project:

```powershell
npm run vercel:env
```

Or manually:

```powershell
npx vercel link --project texoma-dashboard --scope sonrie
.\scripts\setup-vercel-env.ps1
```

## Deploy

**Git push (recommended):** merge to `main` → Vercel builds automatically.

**CLI:**

```powershell
npx vercel login
npx vercel link --project texoma-dashboard --scope sonrie
npx vercel deploy --prod
```

## Verify

1. `GET https://texoma.vercel.app/api/health/opendental-mysql` — MySQL smoke test
2. `GET https://texoma.vercel.app/api/metrics/overview` — overview JSON
3. Open https://texoma.vercel.app/login or `/overview` in the browser

## Permissions note

If deployment fails with **403 Forbidden** / "no permission to create a Production Deployment", a **Team Owner** must either:

- Redeploy from the Vercel dashboard, or
- Grant your account the **Developer** role (or higher) on the Sonrie team.

## Architecture

- **Frontend:** React pages under `src/app/*`
- **Backend:** Route Handlers under `src/app/api/*` (serverless functions on Vercel)
- **Data:** Open Dental MySQL live on page load. MongoDB Atlas is login + GHL settings only.

## Open Dental connectivity

The dashboard queries Open Dental MySQL on page load. Vercel cannot reach an
office-only MySQL server unless you add a tunnel or a reachable replica.
Prefer [OFFICE_INSTALL.md](./OFFICE_INSTALL.md) for practice go-live.
See [SYNC_SCHEDULE.md](./SYNC_SCHEDULE.md).
