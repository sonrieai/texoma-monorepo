# Texoma BI Dashboard

Custom KPI dashboard for Texoma implant / denture practices.

- **UI:** Next.js App Router + Tailwind (layout from implant-practice Canva/HTML mockup)
- **EHR path:** Open Dental → **NexHealth Synchronizer** → this app (`src/lib/nexhealth`). We never talk to OD directly.
- **Views:** Overview, Doctor, Patients by Area (city-level geo — no patient directory)

> **Open Dental Trial:** the [official trial](https://www.opendental.com/site/trial.html) **does not support the API or eServices**, so it cannot feed NexHealth. Use NexHealth sandbox (or a registered OD office with Synchronizer) for live data. Details: [docs/OD_NEXHEALTH_CONNECTION.md](docs/OD_NEXHEALTH_CONNECTION.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # MONGODB_URI + NEXHEALTH_* (see .env.example)
npm run sync:nexhealth       # NexHealth → Mongo warehouse (required once)
npm run dev                  # http://localhost:5001 → /overview
```

Overview reads **MongoDB only** on page load — not NexHealth. Set `MONGODB_URI` and run `npm run sync:nexhealth` (or `sync:nexhealth:full`) before expecting KPIs. Production can sync automatically every 24h via **Vercel Cron** or Windows Task Scheduler — see [docs/SYNC_SCHEDULE.md](docs/SYNC_SCHEDULE.md).

## Deploy (Vercel)

See [docs/VERCEL.md](docs/VERCEL.md). **Production:** https://texoma.vercel.app/login — project **texoma-monorepo** on team **Sonrie**. Push env vars with `npm run vercel:env` (after `npx vercel login`), then deploy via Git push or `npm run vercel:deploy`.

## Deploy (Netlify)

See [docs/NETLIFY.md](docs/NETLIFY.md). Repo includes [`netlify.toml`](netlify.toml) (`npm run build`, Node 20). Add `NEXHEALTH_*` secrets in the Netlify UI before the first deploy.

## Docs for discovery

- [docs/HIPAA_NO_EPHI.md](docs/HIPAA_NO_EPHI.md) — BAA checklist, allowed fields, NO-ePHI flow
- [docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) — what NexHealth / GHL can and cannot provide; Formulas tab → code map
- [docs/FORMULAS_DR_QUESTIONS.md](docs/FORMULAS_DR_QUESTIONS.md) — KPI formula questions to freeze with Dr
- [docs/FIELD_MAP.md](docs/FIELD_MAP.md) — field mapping draft for Beshoy

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |

## Health check

`GET /api/health/nexhealth` — NexHealth auth smoke test  
`GET /api/metrics/overview` — overview JSON (Mongo warehouse; same engine as `/overview`)
