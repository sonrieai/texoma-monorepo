# Deploy on Netlify

This app is **Next.js 16 App Router** with server Route Handlers (`/api/*`) and server-rendered pages. Netlify supports this with [zero-config Next.js Runtime](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/) ([Next.js 16 on Netlify](https://www.netlify.com/changelog/next-js-16-deploy-on-netlify/)).

Config in repo: [`netlify.toml`](../netlify.toml).

## Before you click Deploy

1. Push this repo to GitHub/GitLab/Bitbucket (Netlify UI → Import project).
2. **Do not** commit `.env.local` (already gitignored).
3. Add environment variables in Netlify (Site configuration → Environment variables → add for Production / Deploy Previews as needed):

| Variable | Example / notes |
|----------|-----------------|
| `NEXHEALTH_API_KEY` | Your sandbox/production key (secret) |
| `NEXHEALTH_SUBDOMAIN` | e.g. `sonrie-demo-practice` or your OD sync institution |
| `NEXHEALTH_LOCATION_ID` | e.g. `331107` or your synced OD location id |
| `NEXHEALTH_BASE_URL` | `https://nexhealth.info` |
| `NEXHEALTH_API_VERSION` | `v3.0.0` |
| `GHL_API_KEY` | Optional / later |
| `GHL_LOCATION_ID` | Optional / later |
| `GHL_BASE_URL` | Optional / later |

Without `NEXHEALTH_API_KEY`, Overview will error (mock data is disabled).

## Netlify UI steps

1. Log in at [app.netlify.com](https://app.netlify.com).
2. **Add new site** → **Import an existing project** → pick the Git repo.
3. Build settings (usually auto-detected):
   - **Build command:** `npm run build`
   - **Publish directory:** leave as Netlify’s Next.js default (do not force `out` — this is not a static export).
   - **Node:** 20 (set via `netlify.toml`).
4. Add the env vars above **before** the first production deploy (or trigger a Redeploy after adding them).
5. **Deploy site**.
6. Open `https://<your-site>.netlify.app/api/health/nexhealth` — expect `"ok": true`.
7. Open `/overview` for live NexHealth KPIs.

## After Open Dental Synchronizer

When your laptop/practice OD sync is live, update Netlify env:

- `NEXHEALTH_SUBDOMAIN` → your institution subdomain  
- `NEXHEALTH_LOCATION_ID` → new location id from the Developer Portal  

Then **Trigger deploy** → Clear cache and deploy site.

## Notes

- Local `npm start -p 5000` port does **not** apply on Netlify.
- Open Dental / MySQL stay on the Windows/practice machine; only NexHealth API is called from Netlify.
- Protect the site (Netlify Password Protection / SSO) before sharing PHI-adjacent dashboards publicly.
