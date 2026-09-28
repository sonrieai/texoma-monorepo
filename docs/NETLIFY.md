# Deploy on Netlify

This app is **Next.js 16 App Router** with server Route Handlers (`/api/*`) and server-rendered pages. Netlify supports this with [zero-config Next.js Runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) ([Next.js 16 on Netlify](https://www.netlify.com/changelog/next-js-16-deploy-on-netlify/)).

Config in repo: [`netlify.toml`](../netlify.toml).

## When Netlify is appropriate

Same constraint as Vercel: Open Dental MySQL must be **reachable from Netlify**.
For a typical office-only MySQL on the dental server, use the LAN install:
[OFFICE_INSTALL.md](./OFFICE_INSTALL.md).

## Before you click Deploy

1. Push this repo to GitHub/GitLab/Bitbucket (Netlify UI → Import project).
2. **Do not** commit `.env.local` (already gitignored).
3. Add environment variables in Netlify (Site configuration → Environment variables → add for Production / Deploy Previews as needed):

| Variable | Example / notes |
|----------|-----------------|
| `OD_MYSQL_HOST` | Open Dental MySQL host (must be reachable from Netlify) |
| `OD_MYSQL_PORT` | Usually `3306` |
| `OD_MYSQL_USER` | SELECT-only user |
| `OD_MYSQL_PASS` | |
| `OD_MYSQL_DB` | e.g. `opendental` |
| `MONGODB_URI` | Login + GHL settings only (secret) |
| `MONGODB_DB` | Auth database name |
| `AUTH_SESSION_SECRET` | ≥32 chars |
| `GHL_API_KEY` | Optional / later |
| `GHL_LOCATION_ID` | Optional / later |
| `GHL_BASE_URL` | Optional / later |

Without reachable `OD_MYSQL_*`, KPI pages cannot load clinical data.
`MONGODB_URI` is required for login.

## Netlify UI steps

1. Log in at [app.netlify.com](https://app.netlify.com).
2. **Add new site** → **Import an existing project** → pick the Git repo.
3. Build settings (usually auto-detected):
   - **Build command:** `npm run build`
   - **Publish directory:** leave as Netlify’s Next.js default (do not force `out` — this is not a static export).
   - **Node:** 20 (set via `netlify.toml`).
4. Add the env vars above **before** the first production deploy (or trigger a Redeploy after adding them).
5. **Deploy site**.
6. Open `/overview` after MySQL connectivity is confirmed (`/api/health/opendental-mysql`).

## Notes

- Local `npm run start:lan` (port 8080) is for office LAN — not Netlify.
- Prefer [OFFICE_INSTALL.md](./OFFICE_INSTALL.md) when MySQL stays on the practice machine.
- Protect the site (Netlify Password Protection / SSO) before sharing dashboards publicly.
