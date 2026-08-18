# HIPAA / BAA / NO-ePHI runbook

Texoma Dashboard stores **no electronic protected health information (ePHI)** in MongoDB Atlas or on Vercel. Identifiers stay in Open Dental and NexHealth. The warehouse and dashboard use internal IDs, clinical/financial facts, and city-level geo only.

Staff look up named patients in Open Dental or NexHealth — `/patients` is removed.

## Data flow

```text
Open Dental (Covered Entity)
        │  NexHealth Synchronizer
        ▼
NexHealth API  (Business Associate — PHI at rest)
        │  sync job + PHI stripper (SYNC_STRIP_PHI)
        ▼
MongoDB Atlas warehouse  (de-identified: IDs, codes, dollars, city/ZIP)
        │
        ▼
Texoma Dashboard on Vercel  (aggregates + login)  — NO ePHI zone

GoHighLevel CRM  (separate BAA if CRM holds names/phones)
        │  read opportunities only
        ▼
Marketing / TC pages  (channel counts — contact names dropped at parse)
        ✗ never written to Mongo
```

## BAA checklist (practice = Covered Entity)

Complete **before** syncing real office data:

| Vendor | Why | Status | Link / notes |
|--------|-----|--------|----------------|
| NexHealth | Synchronizer + API hold full EHR payloads | Practice signs | NexHealth trust / legal |
| MongoDB Atlas | Warehouse host (de-identified after this plan; BAA still recommended) | Practice signs | https://www.mongodb.com/products/platform/trust/hipaa |
| GoHighLevel | CRM may store lead names/phones for TC | Sign if GHL is used in production | GHL HIPAA / BAA |
| Vercel | Hosts UI + API; **no patient database** | Document NO-ePHI posture | No BAA required if warehouse is de-identified |

## Subprocessor register

| Subprocessor | Data received | ePHI? |
|--------------|---------------|-------|
| NexHealth | Full patient + clinical records via Synchronizer | Yes (BA) |
| MongoDB Atlas | `patientId`, inactive, insurance carrier name, city/state/ZIP, appointments, procedures, ledger, AR | No names/phones/emails/DOB/street |
| Vercel | Aggregated KPIs; session cookies for dashboard users | No patient ePHI |
| GoHighLevel | Opportunities (names exist in CRM; dashboard drops `contact` / opportunity `name` at parse) | Yes in GHL; not stored in warehouse |

## Allowed warehouse fields

**`patients` collection (index only):** `patientId`, `locationId`, `inactive`, `primaryInsuranceCarrier`, `geoCity`, `geoState`, `geoZip`, `syncedAt` (+ warehouse ids/timestamps).

**Clinical / financial docs:** IDs, dates, codes, amounts, statuses, provider IDs. No `bio`, contact fields, street address, claim/payment free-text `note`/`notes`.

**Never stored:** `first_name`, `last_name`, `email`, `phone`, SSN, DOB, street address, guarantor names, full NexHealth `raw` patient payloads.

Code: [`src/lib/mongo/phi-policy.ts`](../src/lib/mongo/phi-policy.ts).

## Policies the practice owns

- Privacy and Security policies
- Breach notification procedure
- Access control and workforce training
- Data retention (Atlas backups, sync logs)

## Production env (Vercel)

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH_SESSION_SECRET` | Yes (≥32 chars) | Dashboard login |
| `NEXHEALTH_DEBUG` | Set `0` | Debug/proxy APIs disabled in production regardless |
| `SYNC_STRIP_PHI` | Set `1` (default on unless `0`) | Slim warehouse writes |
| `SYNC_SECRET` | Yes | `POST /api/sync/nexhealth` |

## Incident contacts

Fill in with the practice:

| Role | Name | Contact |
|------|------|---------|
| Privacy officer | | |
| Security / IT | | |
| NexHealth support | | |
| MongoDB Atlas admin | | |

## Go-live checklist

- [ ] BAAs signed (NexHealth, Atlas, GHL if used)
- [ ] Atlas backup / snapshot taken
- [ ] `npm run purge:phi` (or full resync) — Compass shows no names/emails
- [ ] Vercel: `NEXHEALTH_DEBUG=0`, `SYNC_STRIP_PHI=1`, `AUTH_SESSION_SECRET` set
- [ ] `/patients` returns 404; `/overview`, `/doctor`, `/insurance`, `/geo`, `/marketing` load
- [ ] SoonerCare production KPI still matches carrier-based logic
- [ ] `/api/debug/nexhealth` and `/api/nexhealth/*` return 404 in production
- [ ] Breach runbook shared with the practice

## Local / CI scripts (do not run in production CI)

`scripts/export-nexhealth-json.ts`, `scripts/diagnose-*.ts` may print upstream fields. Dev-only; never commit exports.
