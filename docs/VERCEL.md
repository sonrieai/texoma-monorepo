# Deploy on Vercel

This app is a **single Next.js 16 project** — UI pages and API Route Handlers (`/api/*`) deploy together on one Vercel project. There is no separate backend service.

Config in repo: [`vercel.json`](../vercel.json).

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
| `MONGODB_URI` | Yes | Atlas connection string (warehouse reads) |
| `MONGODB_DB` | Yes | e.g. `open-dental-backup` |
| `NEXHEALTH_API_KEY` | Yes | NexHealth API key (secret) |
| `NEXHEALTH_SUBDOMAIN` | Yes | Institution subdomain |
| `NEXHEALTH_LOCATION_ID` | Yes | Location id |
| `NEXHEALTH_BASE_URL` | Yes | `https://nexhealth.info` |
| `NEXHEALTH_API_VERSION` | Yes | `v3.0.0` |
| `SYNC_SECRET` | Recommended | Protects `POST /api/sync/nexhealth` |
| `NEXHEALTH_DEBUG` | **Set `0` in production** | Debug/proxy APIs return 404 in production anyway |
| `SYNC_STRIP_PHI` | Yes (`1`) | Slim warehouse writes (default on unless `0`) |
| `AUTH_SESSION_SECRET` | Yes (≥32 chars) | Required for Vercel production builds |
| `PASSWORD_RESET_WEB_BASE_URL` | Recommended | `https://texoma.vercel.app` (password reset email links) |
| `GHL_API_KEY` | Optional | GoHighLevel (later) |
| `GHL_LOCATION_ID` | Optional | GoHighLevel (later) |
| `GHL_BASE_URL` | Optional | GoHighLevel (later) |

Without `MONGODB_URI`, Overview and most KPI pages will fail. Without `NEXHEALTH_*`, sync jobs and debug routes fail.

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

1. `GET https://texoma.vercel.app/api/health/nexhealth` — NexHealth auth smoke test
2. `GET https://texoma.vercel.app/api/metrics/overview` — overview JSON
3. Open https://texoma.vercel.app/login or `/overview` in the browser

## Permissions note

If deployment fails with **403 Forbidden** / "no permission to create a Production Deployment", a **Team Owner** must either:

- Redeploy from the Vercel dashboard, or
- Grant your account the **Developer** role (or higher) on the Sonrie team.

## Architecture

- **Frontend:** React pages under `src/app/*`
- **Backend:** Route Handlers under `src/app/api/*` (serverless functions on Vercel)
- **Data:** MongoDB Atlas warehouse (synced via `npm run sync:nexhealth` locally or `POST /api/sync/nexhealth`)
- Open Dental / MySQL stays on the practice network — not deployed to Vercel
