# Texoma BI Dashboard

Custom KPI dashboard for Texoma implant / denture practices.

- **UI:** Next.js App Router + Tailwind (layout from implant-practice Canva/HTML mockup)
- **EHR path:** Open Dental MySQL → dashboard (live SELECT on each page load).
- **Views:** Overview, Doctor, Patients by Area (city-level geo — no patient directory)

The official Open Dental trial can be restored to local MySQL for development.
Production access should use a SELECT-only database account on the office LAN
(or VPN). Login users and saved GHL settings live in a local JSON file (`data/store.json`).

## Quick start (laptop)

```bash
npm install
cp .env.example .env.local   # OD_MYSQL_* required; AUTH_* for login
# Trial: match Choose Database (often localhost / root / demo) — see docs/LOCAL_OPENDENTAL.md
npm run probe:opendental-mysql
npm run validate:opendental  # optional PHI-safe snapshot sanity
npm run dev                  # http://localhost:5001 → /overview
```

Overview reads **Open Dental MySQL** on page load. Set `OD_MYSQL_HOST`,
`OD_MYSQL_USER`, `OD_MYSQL_DB`, and `OD_MYSQL_PASS`. See
[docs/LOCAL_OPENDENTAL.md](docs/LOCAL_OPENDENTAL.md).

## Office LAN install (practice)

Run on the Open Dental Windows Server — firewall LocalSubnet :8080, NSSM service:

→ [docs/OFFICE_INSTALL.md](docs/OFFICE_INSTALL.md)

```bash
npm ci && npm run build
npm run start:lan            # http://0.0.0.0:8080
```

## Deploy (Vercel)

Only when MySQL is reachable from Vercel (not typical office-only MySQL).
See [docs/VERCEL.md](docs/VERCEL.md). **Cloud URL:** https://texoma.vercel.app/login —
project **texoma-monorepo** on team **Sonrie**.

## Deploy (Netlify)

Same MySQL reachability constraint. See [docs/NETLIFY.md](docs/NETLIFY.md).

## Docs for discovery

- [docs/OFFICE_INSTALL.md](docs/OFFICE_INSTALL.md) — Windows Server LAN handoff
- [docs/HIPAA_NO_EPHI.md](docs/HIPAA_NO_EPHI.md) — BAA checklist, allowed fields, NO-ePHI flow
- [docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) — what Open Dental / GHL can and cannot provide; Formulas tab → code map
- [docs/FORMULAS_DR_QUESTIONS.md](docs/FORMULAS_DR_QUESTIONS.md) — KPI formula questions to freeze with Dr
- [docs/FIELD_MAP.md](docs/FIELD_MAP.md) — field mapping draft for Beshoy

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server (:5001) |
| `npm run build` | Production build |
| `npm run start` | Serve production build (:5003) |
| `npm run start:lan` | LAN listen `0.0.0.0:8080` |
| `npm run probe:opendental-mysql` | PHI-safe MySQL connectivity probe |
| `npm run validate:opendental` | Probe + snapshot sanity counts |
| `npm run lint` | ESLint |

## Health check

`GET /api/health/opendental-mysql` — Open Dental MySQL smoke test
`GET /api/metrics/overview` — overview JSON (live Open Dental MySQL; same engine as `/overview`)
