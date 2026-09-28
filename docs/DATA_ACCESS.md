# Data access matrix (Texoma / Open Dental + GHL)

For Beshoy field-mapping discovery. EHR reads use a SELECT-only Open Dental
MySQL connection on dashboard page load.

**Connection overview:** [LOCAL_OPENDENTAL.md](./LOCAL_OPENDENTAL.md).

**Procedure codes:** [OD_PROCEDURE_CODES.md](./OD_PROCEDURE_CODES.md). KPI code map from `TEXOMA OPEN DENTAL CODES 8-11-26.xlsx`.

## Path

```text
Open Dental MySQL (backup or office LAN/VPN)
        │  SELECT-only on page load
        ▼
src/lib/opendental → aggregators
        │
        ▼
Dashboard pages
```

MongoDB stores dashboard users and GHL credentials only — not production/AR/geo.

Env:

```env
OD_MYSQL_HOST=127.0.0.1
OD_MYSQL_USER=texoma_dashboard
OD_MYSQL_PASS=...
OD_MYSQL_DB=opendental
```

Office LAN: [OFFICE_INSTALL.md](./OFFICE_INSTALL.md). Laptop trial:
[LOCAL_OPENDENTAL.md](./LOCAL_OPENDENTAL.md).

Identifiers stay in Open Dental. Dashboard aggregators use internal IDs, codes, dollars, and city/ZIP — see [HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md).

## Formulas tab → code mapping

Source workbook: `TEXOMA OPEN DENTAL CODES 8-11-26.xlsx` (Formulas + Code Chart + Flat List).

Formulas live in `src/lib`, not React. Path: Open Dental MySQL → aggregators → Overview cockpit.

**UI:** `src/components/analytics/CockpitMetrics.tsx`, `OverviewCharts.tsx`, Doctor / Insurance pages.  
**Compute:** `src/lib/warehouse/conversion.ts`, `production.ts`, `payment-mix.ts`, `ar.ts`, `cdt/categories.ts`.
**Live load:** `src/lib/opendental/snapshot.ts` + `src/lib/warehouse/build-overview.ts`.

**Conversion (1–4) frozen 2026-08-13** — OD defaults. SC / adjusted $ / volume still wait on freeze items 5–11. See [FORMULAS_DR_QUESTIONS.md](./FORMULAS_DR_QUESTIONS.md).

### New Patient Conversion

| Metric | Sheet formula | Today | Where | Dr blocker |
|--------|---------------|-------|-------|------------|
| New Patients (NP) | Distinct patients whose **first completed treatment visit** falls in the period (count once on that date) | First completed **non-consult** appointment in history through period end; consult = N9310 day or consult appointment type | `conversion.ts` `summarizeConversion` | Frozen: treatment visit, not consult |
| Consult Show Rate | Completed ÷ scheduled using **N9310** types. **69 No Show** = missed. **66 team cancel** removed from denom | N9310 Complete (orphan) **or** consult-type appt. OD confirm **69** = miss; **66/67** drop. Fallback: cancelled / patient_missed / check-in | `conversion.ts` `mapConversionAttendance` + [FIELD_MAP.md](./FIELD_MAP.md) | Frozen: 67 drops like 66 |
| Same Day Starts | NP consults where Tx **accepted and started same day**. Rate = starts ÷ **consults completed** | Consult Complete + same-day **U-AOXS / U-AOXD / U-FMR** Complete; else first non-consult Complete proc. Rate ÷ consult Completes | `conversion.ts` `summarizeConversion` | Frozen: U sold codes |
| Treatment Plan Closed | Every planned procedure **complete** | All TP line items Complete (empty plan only if status `completed`, not `accepted`) | `conversion.ts` `isTreatmentPlanClosed` | Frozen: all procs complete |

### Production dollars

| Metric | Sheet formula | Today | Where | Dr blocker |
|--------|---------------|-------|-------|------------|
| Adjusted Production | Gross − adjustments & write-offs | `netProductionCents` = gross − \|all adjustments\| | `production.ts` `summarizeProductionFromLedger` | Which OD **adjustment types** to subtract to match month-end? |
| SC Production | Production for patients whose **insurance carrier is SoonerCare**; `.1`/`.2` code variants also flag SC | **Payments** classified SoonerCare/Medicaid by name regex — not patient carrier, not `.1`/`.2` procs | `payment-mix.ts` + `production.ts` | Exact carrier name in OD? Count by **carrier**, **SC code**, or both? |
| AOX (category) | All-on-4 / 6 / X + full-mouth implant $ together | CDT category `Fixed (All-on-4)` | `cdt/categories.ts` + `cdt-categories.json` | — |

### Procedure Volume

`volumeBucket()` in `src/lib/cdt/categories.ts` + Code Chart lists in `cdt-categories.json`.

| Metric | Sheet formula | Today | Where | Dr blocker |
|--------|---------------|-------|-------|------------|
| Extractions | Completed procs on Extractions Code Chart list | Same idea via `volumeBucket` / category Extractions | `categories.ts` + json | — |
| Implants Placed | Implants Code Chart list | Same | same | — |
| AOX Cases | Count of **sold case code**. Est. $ = count × 4. Going forward **U-AOXS** / **U-AOXD**; keep legacy in count | Counts **all** AOX / Fixed All-on-4 codes. `aoxSoldCodes` exist (`U-AOXS`, `U-AOXD`, `U-FMR`) but tile is not sold-only + ×4 | `isAoxCode` / `AOX_SOLD_CODE_SET`; bump in `production.ts` | Which code marks sold **today**? Is ×4 **per arch** or implant count? |
| Dentures Delivered | Completed denture **deliveries** in period | Denture **D-codes** (D5110 etc.), not **N4120** | `volumeBucket` dentures; json has `N4120` | Count **N4120 Denture Delivery** or **D5110/D5120**? |

### Collections and AR

| Metric | Sheet formula | Today | Where | Dr blocker |
|--------|---------------|-------|-------|------------|
| Collections | Patient + insurance payments in period | Sum of payments → `collectionsCents` | `production.ts` | — |
| Collection Ratio | Collected ÷ **production** (same period), % | Collected ÷ **gross** production | `production.ts` `collectionRatio` | Confirm denom = gross vs adjusted |
| Total AR | Outstanding patient + insurance | Guarantor balances `totalArCents` | `ar.ts` + warehouse | — |
| AR Over 90 Days | Share of AR > 90 days | `arOver90Ratio` from aging buckets | `ar.ts` / warehouse | — |

### Treatment by Type

| Metric | Sheet formula | Today | Where |
|--------|---------------|-------|-------|
| Production by Category | Trailing **6 months**, $ by category, one column/month | `TreatmentByTypeSection` from `production.treatmentByMonth` | `production.ts` `buildTreatmentByMonth` + `OverviewCharts.tsx` |

### Denture Production and Payments

| Metric | Sheet formula | Today | Where | Dr blocker |
|--------|---------------|-------|-------|------------|
| Denture Production by Warranty | $ by tier 6mo / 1 / 3 / 5 yr; tiers can gain new codes | `warrantyBucket` on CDT map (`m6`/`y1`/`y3`/`y5`) | `lookupWarrantyBucket` + json via `scripts/sync-cdt-from-xlsx.py` | — (keep syncing Code Chart) |
| Partials | Same warranty split on **partial** code list | Partials are a **volume count**, not warranty $ series | `production.ts` + `OverviewCharts.tsx` | Which partial codes → which warranty tier? |
| Remakes | Count remake procs in period | Heuristic repair codes (D5511+ / description “repair\|remake”) | `categories.ts` `DENTURE_REMAKE_CODES` | Official remake **code list** from OD |
| Remakes % | Remakes ÷ **dentures delivered** (same period) | Remakes ÷ denture **D-code** count | CockpitMetrics / doctor pages | Denom = deliveries **this period**, or original **seat dates** remakes trace to? |

### Close enough vs must change

- **Close (tune after Dr):** extractions, implants, collections, total AR, AR>90, treatment-by-type, denture warranty $ (if Code Chart suffixes stay mapped).
- **Done (PR1 conversion):** NP definition, consult show (N9310 + 66/67/69), same-day U-sold, TP closed = all procs complete.
- **Must change after freeze:** SC by carrier/codes, adjusted production AdjTypes, AOX sold-only + ×4, denture delivery code, remake list + %, partials warranty.
- **Data gaps:** sandbox often has unmapped/custom codes → volume tiles stay 0. OD confirm codes 66/67/69 may not exist on Open Dental appointment payloads — see [FIELD_MAP.md](./FIELD_MAP.md).

### Open Dental recommended defaults

How OD actually reports these (use unless Dr overrides):

| # | KPI | OD-native default |
|---|-----|-------------------|
| 1 | NP | First completed **treatment** visit (non-N9310). OD New Patient report uses DateFirstVisit (often consult) — Formulas tab wants treatment; keep consult show separate. |
| 2 | Consult show | N9310 Complete ÷ (Complete + Broken). **69** = miss. **66** and **67** drop from denom (cancels are not no-shows). |
| 3 | Same-day start | N9310 Complete + **U-AOXS / U-AOXD / U-FMR** (or first Tx proc Complete) same calendar day. |
| 4 | TP closed | Every TP proc **Complete** (C). Accepted/signed ≠ closed. |
| 5 | Adjusted production | Gross − **write-off / contractual** AdjTypes only (OD P&I). |
| 6 | SC production | Patient carrier **SoonerCare / Medicaid / OHCA** **or** chart code whose description starts with `SC` (`D1110.1`, `D5213.1`, `D5214.1`). **Not** denture warranty `.1`–`.4`. |
| 7 | AOX cases | Sold markers **U-AOXS** (×4 implants), **U-AOXD** (×8), legacy **U-FMR** (treat as single arch). Tile = sold case count. |
| 8 | Dentures delivered | **D5110 / D5120 Complete**. Do not also count **N4120** (double count). |
| 9 | Remakes | CDT repair family D5511+ / D6090 + description contains remake. Complete only. |
| 10 | Remakes % | Remakes ÷ **same-period** denture deliveries. |
| 11 | Partials warranty | Same suffix map as dentures (`.1` m6, `.4` y1, `.2` y3, `.3` y5) **except** SC-described codes. |
| 12 | Collection ratio | Collected ÷ **gross** production (OD P&I). |

### Questions for Dr

Sendable checklist: **[FORMULAS_DR_QUESTIONS.md](./FORMULAS_DR_QUESTIONS.md)**. Items **1–4 frozen**; freeze 5–12 before SC / volume aggregators.

Refresh CDT map after Code Chart edits:

```powershell
python scripts/sync-cdt-from-xlsx.py "C:\Users\RohitSahu\Downloads\TEXOMA OPEN DENTAL CODES 8-11-26.xlsx"
```

## Mongo collections (login / GHL only)

| Collection | Contents |
|------------|----------|
| `dashboard_users`, `password_resets` | Dashboard login |
| `integration_settings` | Encrypted GHL credentials |

Clinical KPIs are not stored in Mongo.

## Probe

```powershell
npm run probe:opendental-mysql
```

## Live Open Dental tables

| Table | Dashboard use |
|-------|----------------|
| `provider` | Doctor pages |
| `appointment`, `appointmenttype` | Volume, visit mix, conversion |
| `procedurelog`, `procedurecode` | Production mix, CDT categories |
| `paysplit`, `payment`, `adjustment` | Collections / write-offs |
| `treatplan`, `proctp` | Conversion + TC |
| `claim`, `insplan`, `patient` aging | Insurance + AR |

## Not from Open Dental — GHL / ads

| Data point | Expected source | Dashboard use |
|------------|-----------------|---------------|
| Leads + pipeline stages | GHL opportunities (Call Center + Appointment) | Marketing funnel · TC channel journey |
| Channel attribution | GHL `utmSessionSource` / opportunity source | Referral table · channel rows |
| Ad spend by channel | GHL Ad Publishing reporting (`/ad-publishing/facebook|google/reporting`) | Cost per lead, ROI, cost/arch — needs `adPublishing.readonly` + connected ads |
| TC acceptance $ / decline reasons | Practice ops / GHL custom | Treatment Coordinator extras |

## Discovery unknowns (short spike)

KPI formula blockers are listed under **Questions for Dr** above. Remaining engineering:

1. Live Texoma institution subdomain vs Sonrie sandbox only.
2. Auth required in Vercel production (`AUTH_SESSION_SECRET`). `/patients` removed — NO-ePHI.
3. Whether Open Dental appointment payloads expose OD confirm codes 66 / 67 / 69.

## Integration stance

- **Write (EHR):** still via Open Dental when needed (booking, attribution).
- **Read (dashboard):** live Open Dental MySQL on page load.
- **UI:** empty connection shows a configuration error — set `OD_MYSQL_*`.
