# HIPAA / BAA / NO-ePHI runbook

Texoma Dashboard stores **no electronic protected health information (ePHI)** in MongoDB Atlas. Identifiers stay in Open Dental. Dashboard aggregators use internal IDs, clinical/financial facts, and city-level geo only — loaded via SELECT-only MySQL on page load, slimmed in memory.

Staff look up named patients in Open Dental — `/patients` is removed.

## Data flow

```text
Open Dental (Covered Entity)
        │  SELECT-only page load; patient names slimmed in memory
        ▼
Texoma Dashboard  (aggregates + login)  — NO ePHI in Mongo

MongoDB Atlas  (dashboard users + encrypted GHL settings only)

GoHighLevel CRM  (separate BAA if CRM holds names/phones)
        │  read opportunities only
        ▼
Marketing / TC pages  (channel counts — contact names dropped at parse)
        ✗ never written to Mongo
```

**Preferred practice host:** Open Dental Windows Server on the office LAN
([OFFICE_INSTALL.md](./OFFICE_INSTALL.md)). Do **not** expose office MySQL to
Vercel/Netlify without a controlled tunnel/replica.

## BAA checklist (practice = Covered Entity)

Complete **before** connecting real office data:

| Vendor | Why | Status | Link / notes |
|--------|-----|--------|----------------|
| Open Dental | Source EHR holds full patient records | Practice manages | Open Dental security controls |
| MongoDB Atlas | Login users + encrypted GHL settings only | Practice signs | https://www.mongodb.com/products/platform/trust/hipaa |
| GoHighLevel | CRM may store lead names/phones for TC | Sign if GHL is used in production | GHL HIPAA / BAA |
| Vercel / Netlify | Optional UI host; **no clinical DB** unless MySQL is intentionally reachable | Document NO-ePHI posture | Prefer office LAN for clinical SQL |

## Subprocessor register

| Subprocessor | Data received | ePHI? |
|--------------|---------------|-------|
| Open Dental | Full patient + clinical records | Yes (source EHR) |
| MongoDB Atlas | Dashboard users; encrypted GHL credentials | No clinical ePHI |
| Vercel / Netlify (if used) | Aggregated KPIs; session cookies for dashboard users | No patient ePHI when MySQL is not on that host |
| GoHighLevel | Opportunities (names exist in CRM; dashboard drops `contact` / opportunity `name` at parse) | Yes in GHL; not stored in Mongo |

## In-memory / response policy

Aggregators may use internal IDs, dates, codes, amounts, statuses, provider IDs, and city/ZIP. Patient names are stripped via [`src/lib/mongo/phi-policy.ts`](../src/lib/mongo/phi-policy.ts) before KPI use.

**Never log or persist:** `first_name`, `last_name`, `email`, `phone`, SSN, DOB, street address, guarantor names, full Open Dental `raw` patient payloads.

## Policies the practice owns

- Privacy and Security policies
- Breach notification procedure
- Access control and workforce training
- Data retention (Atlas backups for login/GHL only)

## Production env

### Office LAN (recommended)

| Variable | Required | Notes |
|----------|----------|-------|
| `OD_MYSQL_*` | Yes | SELECT-only `kpi_readonly` on localhost |
| `MONGODB_URI` | Yes | Login + GHL only |
| `AUTH_SESSION_SECRET` | Yes (≥32 chars) | Dashboard login |
| Firewall | Yes | Port 8080 LocalSubnet only — see OFFICE_INSTALL |

### Vercel (only if MySQL is reachable)

| Variable | Required | Notes |
|----------|----------|-------|
| `OD_MYSQL_*` | Yes | Must reach practice DB |
| `AUTH_SESSION_SECRET` | Yes (≥32 chars) | Dashboard login |
| `MONGODB_URI` | Yes | Login + GHL only |

## Incident contacts

Fill in with the practice:

| Role | Name | Contact |
|------|------|---------|
| Privacy officer | | |
| Security / IT | | |
| Open Dental support | | |
| MongoDB Atlas admin | | |

## Go-live checklist

- [ ] BAAs signed where applicable (Atlas, GHL if used)
- [ ] SELECT-only MySQL user (`kpi_readonly`); probe shows SELECT-only
- [ ] Office install: firewall LocalSubnet 8080; service `TexomaKPI` running ([OFFICE_INSTALL.md](./OFFICE_INSTALL.md))
- [ ] Mongo Atlas holds **login + GHL only** — no clinical warehouse collections
- [ ] Not using Vercel/Netlify against office-only MySQL
- [ ] `/patients` returns 404; `/overview`, `/doctor`, `/insurance`, `/geo`, `/marketing` load
- [ ] Overview totals spot-checked against Open Dental Production / A/R
- [ ] Breach runbook shared with the practice

## Local / CI scripts (do not run in production CI)

Diagnostic scripts may print aggregate counts. Use only in controlled development environments. Prefer `npm run probe:opendental-mysql` and `npm run validate:opendental` (PHI-safe).
