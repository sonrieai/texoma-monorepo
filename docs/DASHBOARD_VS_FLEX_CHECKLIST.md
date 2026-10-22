# Dashboard vs Flex — table checklists

Use this when validating the **Texoma dashboard** (`src/`) against:

1. **Open Dental Flex** — patient texting and appointment reminders (operational boundaries).
2. **Open Dental MySQL / reports** — numbers on screen match independent SQL (same definitions as `npm run validate:dashboard`).
3. **Legacy KPI Dashboard** (optional) — old mock app in `fullarched-monorepo`; see [FRONTEND_PARITY_REVIEW.md](./FRONTEND_PARITY_REVIEW.md).

**How to run automated checks**

```bash
npm run validate:dashboard    # dashboard aggregates vs read-only MySQL
npm run compare:production-units -- --month YYYY-MM   # before OD_PRODUCTION_USE_UNITS=1
npm run validate:opendental   # connection + schema probe
```

Pick a **closed month** for dollar reconciliation; use **YTD** for volume trends. Record pass/fail and notes in the **Pass?** column.

---

## 1. Open Dental Flex vs dashboard + GHL (who owns what)

Flex sends reminders and routine patient texts from Open Dental. The dashboard **does not** send reminders. GHL sync mirrors schedule state for CRM/workflows only.

| # | Topic | Open Dental Flex | Texoma dashboard | OD→GHL sync | Pass? | Notes |
|---|--------|------------------|------------------|-------------|-------|-------|
| 1.1 | Appointment reminders | Flex sends per OD schedule rules | No sends; read-only appt metrics | GHL calendar appts with **`toNotify: false`** | ☐ | See [SYNC_SCHEDULE.md](./SYNC_SCHEDULE.md) |
| 1.2 | Confirm / recall texts | Flex templates | No sends | Does not replace Flex | ☐ | |
| 1.3 | Marketing / nurture blasts | Not Flex (GHL workflows) | Marketing page = OD referrals + GHL funnel | Active Sequence + tags only per spec | ☐ | |
| 1.4 | Text consent (`TxtMsgOk`) | Source of truth in OD | Not editable in UI | Maps Yes/No → SMS DND on **existing** contacts | ☐ | `npm run report:txt-msg-ok` |
| 1.5 | Missed-appt recovery SMS | Flex may send OD-driven msgs | No sends | Item 28 workflows in GHL (draft); stale `od_sync_last_success` guard | ☐ | [GHL_MISSED_APPT_WORKFLOWS.md](./GHL_MISSED_APPT_WORKFLOWS.md) |
| 1.6 | Duplicate reminder risk | Flex on OD calendar | — | GHL calendar **dedicated**; notifications off | ☐ | Staff personal GHL calendars not used |
| 1.7 | Consult date for TC stage | OD appointments | Displays conversion / TC KPIs | `od_consult_date` drives **Consults Today** workflow | ☐ | Miss moves **Leads → No-Show/Cancellation** |
| 1.8 | Patient sees wrong location | Flex uses OD office config | — | Texoma GHL location id locked | ☐ | |

---

## 2. Overview — dashboard vs Open Dental (automated row set)

Compare for each period: **this month**, **YTD**, **last 12 months**, **prior calendar year** (script prints all four).

| # | Metric | Dashboard location | OD / SQL reference | Pass? | Notes |
|---|--------|-------------------|-------------------|-------|-------|
| 2.1 | Gross production | Overview → Production | `procedurelog` Complete, `ProcDate` | ☐ | Units: `compare:production-units` |
| 2.2 | Adjusted production | Overview → Production | Gross − write-offs + adj types | ☐ | [DATA_ACCESS.md](./DATA_ACCESS.md) |
| 2.3 | Collections | Overview → Collections | `paysplit` + insurance `claimproc` | ☐ | |
| 2.4 | Collection ratio | Overview cockpit | Collections ÷ gross | ☐ | |
| 2.5 | SoonerCare production | Overview | SC patients / carrier regex | ☐ | vs payment mix may differ |
| 2.6 | Extractions | Procedure volume | D7140–D7250 Complete | ☐ | |
| 2.7 | Implants placed | Procedure volume | D6010–D6050 Complete | ☐ | |
| 2.8 | Dentures delivered | Procedure volume | D5110–D5140 Complete | ☐ | |
| 2.9 | AOX cases (patients) | Procedure volume | D6114/D6115/D1414/D1313/U-AOX* | ☐ | |
| 2.10 | Denture remakes | Procedure volume | D551*–D6090 + remake text | ☐ | |
| 2.11 | New patients | Conversion → NP's | `DateFirstVisit` in range | ☐ | Dashboard may use first-tx fallback |
| 2.12 | Consult show rate | Conversion | Consult appts + confirm 69/66/67 rules | ☐ | vs OD report name may differ |
| 2.13 | Same-day starts | Conversion | > $250 same-day pay on show day | ☐ | |
| 2.14 | Treatment plan closed $ | Conversion | All TP lines Complete | ☐ | |
| 2.15 | Appointments shown | Cockpit / appt totals | `AptStatus = Complete` | ☐ | |
| 2.16 | No-shows | Appt totals | D9986 window / Broken split | ☐ | |
| 2.17 | Cancellations | Appt totals | D9987 window | ☐ | |
| 2.18 | Total AR | Collections & AR | Guarantor balance column | ☐ | Aging date on notice |
| 2.19 | AR over 90 days | Collections & AR | `BalOver90` sum | ☐ | |
| 2.20 | Payment mix (insurance / cash / financed) | Overview charts | PayType + claim supplement | ☐ | Spot-check one month in OD |

**Manual OD reports (when SQL row disagrees)**

| Report / module | Use for |
|-----------------|--------|
| Production & Income | Gross/adjusted production, units (item 25) |
| Daily / monthly production | Trend sanity |
| Aging report | AR buckets vs `DateLastAging` |
| Appointment analysis | Show / broken / confirm defs |

Field definitions: [OVERVIEW_FIELD_MAP.md](./OVERVIEW_FIELD_MAP.md).

---

## 3. Doctor page — per provider (YTD in validate script)

| # | Metric | Pass? | Notes |
|---|--------|-------|-------|
| 3.1 | Gross production by `ProvNum` | ☐ | |
| 3.2 | Shows / no-shows / cancellations by provider | ☐ | Same D9986/D9987 logic as practice total |
| 3.3 | NP consult show / same-day NP / SC NP (UI) | ☐ | Not all rows in automated script |
| 3.4 | Production by category donut | ☐ | vs OD ProcCat |
| 3.5 | Placeholder columns (F/ FR/ production, SC NP, deferred close) | ☐ | Expected **—** until Dr defines source |

---

## 4. Treatment Coordinator — dashboard vs MySQL

| # | Metric | Pass? | Notes |
|---|--------|-------|-------|
| 4.1 | Plans presented (D7777) — Ashlie | ☐ | N9210 same-day / apt / planned marker |
| 4.2 | Plans presented (D7777) — Brie | ☐ | N9410 |
| 4.3 | Presented $ (same-day plan fee) | ☐ | Script row “Presented ($, same-day plan)” |
| 4.4 | $ Financed vs Overview payment mix | ☐ | Script compares TC total to Overview financed |
| 4.5 | GHL funnel (Presented → Showed → Closed) | ☐ | Stage ids in Settings → GHL funnel |
| 4.6 | Coordinator: OD visit code vs GHL assignee | ☐ | Notice on TC page when they disagree |
| 4.7 | Denial / decline reasons | ☐ | OD + GHL stage merge |

---

## 5. Insurance — dashboard vs Open Dental

| # | Metric | Pass? | Notes |
|---|--------|-------|-------|
| 5.1 | Claims submitted / paid (period) | ☐ | In validate script |
| 5.2 | Insurance collected (period) | ☐ | `claimproc` Status 1,4 |
| 5.3 | Pre-auths submitted | ☐ | ClaimType PreAuth |
| 5.4 | Insurance AR proxy label | ☐ | InsEst split — not carrier subledger |
| 5.5 | Capitation statuses 5 / 7 | ☐ | `npm run check:capitation` — not in collected until approved |
| 5.6 | Clean claim / appeal / eligibility (KPI mock only) | ☐ | **—** in dashboard until OD fields verified |

---

## 6. Marketing — dashboard vs OD + GHL

| # | Metric | Pass? | Notes |
|---|--------|-------|-------|
| 6.1 | Leads by referral source (OD) | ☐ | validate script YTD table |
| 6.2 | GHL funnel counts (booked / showed / accepted / surgery) | ☐ | Id-based tiers; fake lead excluded |
| 6.3 | Ad spend (Facebook / Google) | ☐ | GHL Ad Manager when connected |
| 6.4 | Speed-to-lead / phone pickup | ☐ | Known gap — not from GHL yet |
| 6.5 | Website bookings by source | ☐ | `WEBSITE_BOOKINGS_*` env |
| 6.6 | T12 NP chart / acquisition-cost table (legacy KPI) | ☐ | Optional port — see parity doc |

---

## 7. Patients by Area (Geo)

| # | Check | Pass? | Notes |
|---|--------|-------|-------|
| 7.1 | Production / patient counts match period selected | ☐ | Period must scope geo query |
| 7.2 | No street-address PHI on map | ☐ | [HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md) |
| 7.3 | Campaign flags (FB / mailer / TV) | ☐ | Legacy KPI only — no OD source yet |

---

## 8. Legacy KPI Dashboard vs Texoma dashboard (parity spot-check)

Not Flex — the old **KPI Dashboard** static mock. Use when stakeholders ask “do we still have that tile?”

| # | View | In Texoma dashboard? | In KPI Dashboard only? | Pass? |
|---|------|----------------------|-------------------------|-------|
| 8.1 | Overview core cockpit | Yes | — | ☐ |
| 8.2 | Doctor provider table (extended columns) | Yes (richer) | Subset | ☐ |
| 8.3 | TC funnel label set | Presented → Showed → Closed | Accepted → Scheduled → Same-day | ☐ |
| 8.4 | Insurance pre-auth / SC turnaround | Partial | More manual fields | ☐ |
| 8.5 | Marketing T12 / acquisition-cost / ROI-by-channel charts | Partial | Extra charts | ☐ |
| 8.6 | Freshness badge | Yes (shell) | Yes | ☐ |
| 8.7 | Sample-data warning | No (live OD) | Yes | ☐ |

Detail: [FRONTEND_PARITY_REVIEW.md](./FRONTEND_PARITY_REVIEW.md).

---

## Sign-off block

| Role | Name | Date | Period tested |
|------|------|------|----------------|
| Office / TC | | | |
| Clinical (Dr) | | | |
| IT / dashboard admin | | | |

**Automated log attached:** paste output of `npm run validate:dashboard` for the sign-off period.
