# Change Spec — open questions (Q1–Q7)

Answers belong here as the practice decides. The dashboard code should not guess.

| Q | Topic | Status / next step |
|---|--------|-------------------|
| 1 | Vercel production URL still live; rotate credentials stored in Vercel | Practice: confirm takedown or repoint DNS; audit env in Vercel dashboard (`docs/VERCEL.md`). App uses `PRODUCTION_APP_URL` / `AUTH_URL` from env, not a hard-coded host. |
| 2 | Windows service for OD→GHL on the LAN | See `docs/WINDOWS_OD_SYNC_SERVICE.md` — Task Scheduler + `npm run sync:od-ghl` every 5 minutes. |
| 3 | `InsEst` column guard | Implemented: guarantor balance query omits `InsEst` when the column is missing (`odHasColumn`). |
| 4 | Insurance AR proxy label | Insurance page notice when balances load: AR is InsEst split across buckets, not carrier subledger. |
| 5 | TS vs SQL totalling deliberate? | Ledger totals use MariaDB `GROUP BY` where possible (`listOdDailyProcedureProductionCents`, snapshot TTL cache). Remaining TS aggregation is documented in `docs/DATA_ACCESS.md`. Confirm with Dr whether any path should move next. |
| 6 | Role model (marketing-only, office manager scope) | `normalizeDashboardRole` defaults to `insurance`. Run `npm run list:dashboard-users` and assign roles in the auth store. Product decision pending for a dedicated marketing role. |
| 7 | Sync diagram in repo | `docs/SYNC_SCHEDULE.md` — calendar scope, Chicago time, miss stage, heartbeat field. |
