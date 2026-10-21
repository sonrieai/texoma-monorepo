# Dashboard Change Spec (engineering copy)

Canonical artifact: [Dashboard Change Spec on Claude](https://claude.ai/artifact/2at1SAxoiTqMCQd7b8CK1c) · Reviewed 20 Oct 2026 · Base commit 176aa54 · Repo alignment commit 514ca8e.

Items already fixed are **removed** from the artifact (not marked done). Number gaps (3, 24) are intentional.

## Standing constraints

1. **Never write Open Dental** — SELECT only from app, tests, and scripts.
2. **GoHighLevel writes allowed** — minimise data (contacts only when needed, no duplicate fields, heartbeat only when changed).
3. **Verify before changing formulas** — especially item 25 (production units).
4. **No secrets in the repository.**

## Item index (outstanding)

| Item | Title |
|------|--------|
| 1 | Every page load re-reads three years of ledger |
| 2 | E2E test writes live Open Dental |
| 4 | Pipelines/stages matched by name |
| 5 | Dashboard serves with no login when secret missing |
| 6 | Stored user with no role becomes owner |
| 7 | Coordinator attribution by display name |
| 8 | Broken appointments / confirm 69 hard-coded |
| 9 | Show rates exclude no-show-fee-only patients |
| 10 | Seasonality labelling |
| 11 | GHL dimensions not counts; fake-lead exclusion |
| 12 | Smaller agreed rules |
| 13 | Overview figures contradict |
| 14 | Denture warranty tiers vs production |
| 15 | Same-day starts definition |
| 16 | Treatment-plan-closed vs D7777 |
| 17 | Yearly = YTD |
| 18 | Website bookings by source |
| 19 | Validate command, measured vs entered, freshness |
| 20 | Re-validate after OD upgrade |
| 21 | First sync contact count |
| 22 | GHL field boundaries; miss stage id |
| 23 | GHL test hygiene |
| 25 | Production unit quantities |
| 26 | Patient status filter |
| 27 | Capitation claimproc statuses |
| 28 | Missed-appointment recovery workflows (GHL drafts) |
| 29 | Text consent capture approach |

## Questions (7)

1. Vercel still live / credentials in Vercel env  
2. Windows service on OD server  
3. InsEst column guard  
4. Insurance AR proxy label  
5. TS vs SQL totalling deliberate?  
6. Role model (marketing role, office manager scope)  
7. Sync diagram in repo; calendar scope disclosure  

## Investigation notes

Record conclusions here as items are verified (do not change formulas without closed-month proof).

- **Item 25:** Run `npm run compare:production-units -- --month YYYY-MM` before changing SQL. Set `OD_PRODUCTION_USE_UNITS=1` only when the script matches Open Dental P&I.
- **Item 2:** `npm run test:od-ghl-e2e` refuses unless `OD_GHL_E2E_MYSQL_*` differs from live `OD_MYSQL_*` and `GHL_E2E_ALLOW=1`. SYNCTEST rows: `npm run audit:synctest-od`.
- **Item 21:** `npm run sync:od-ghl -- --dry-run` prints `wouldCreate`, `wouldMatch`, and `unclear` contact counts before the first live run.
- **Item 29:** Run `npm run report:txt-msg-ok` for Yes/No/Unknown counts.
