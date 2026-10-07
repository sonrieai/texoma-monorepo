# Overview KPI baseline (Texoma OD MySQL)

Reference window: **2026-01-01 through 2026-10-06** (yearly 2026 YTD at time of plan).

Captured before MySQL-only KPI fixes. Use to verify regressions after each phase.

## MySQL spot checks

| Check | Value |
|-------|--------|
| Completed D0150 | ~1,092 |
| Completed D0140 | ~135 |
| Completed N9310\* consult codes | ~92 |
| NP-style appt types (5, 30, 31, 44, 45, 47, 52) | ~2,433 appts |
| `treatplan` DateTP in range, TPStatus=0 | ~4,939 |
| Guarantor `BalOver90` sum | ~$42,839 |
| Guarantor aging bucket sum | ~$250,065 |
| Guarantor `EstBalance` sum | ~−$1.18M |
| `claim.InsPayAmt` (received in range) | ~$1.9M |

## Pre-fix dashboard symptoms

- Consult show rate / same-day starts: **—**
- Treatment plan closed: **$0**
- AR over 90 days: **—** (negative total AR)
- Payment mix insurance: **0%**
- Denture/partial warranty charts: **$0**

## Post-fix API spot check (2026-01-01 – 2026-10-06)

After MySQL-only mapper/inference changes:

- `conversion.npConsultShowRate` ≈ **0.92**, `npConsultShow` ≈ **11k**
- `conversion.sameDayStartRate` ≈ **0.76**
- `conversion.tpClosedCents` ≈ **$2.7M** (1202 plans)
- `accountsReceivable.arOver90Ratio` ≈ **14.5%**, `totalArCents` ≈ **$294k** (aging-normalized)
- `production.paymentMix.insurance` populated via PayType + claim supplement
- Denture warranty buckets non-zero when codes carry suffix/description hints

## API fields to compare

`GET /api/metrics/overview?start=2026-01-01&end=2026-10-06`

- `conversion.npConsultShowRate`, `conversion.npConsultShow`, `conversion.sameDayStartRate`
- `conversion.treatmentPlanClosedCents`
- `accountsReceivable.arOver90Ratio`, `accountsReceivable.totalArCents`
- `production.paymentMix.insurance`
- `production.dentureWarranty`, `production.partialWarranty`
