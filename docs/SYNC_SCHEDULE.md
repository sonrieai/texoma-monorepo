# Open Dental connectivity

The dashboard queries Open Dental MySQL on each page load. There is no
warehouse sync job.

The Next.js process must reach the practice database (local MySQL, office LAN,
or VPN). Vercel/Netlify hosts cannot reach an office-only MySQL server unless
you add a tunnel or a reachable replica.

## Local laptop

See [LOCAL_OPENDENTAL.md](./LOCAL_OPENDENTAL.md) (trial `demo` / `root`, or a
SELECT-only restore).

```bash
npm run probe:opendental-mysql
npm run validate:opendental
npm run dev                  # http://localhost:5001
```

## Office LAN (recommended for practice MySQL)

Run the app **on the Open Dental server** (or another host that can reach it on
the trusted network). Full handoff:

→ [OFFICE_INSTALL.md](./OFFICE_INSTALL.md)

```bash
npm run build
npm run start:lan            # 0.0.0.0:8080
```

Required env: `OD_MYSQL_HOST`, `OD_MYSQL_PORT`, `OD_MYSQL_USER`,
`OD_MYSQL_PASS`, `OD_MYSQL_DB`.

## Check the connection

```bash
npm run probe:opendental-mysql
npm run validate:opendental
```

Also: `GET /api/health/opendental-mysql` (auth may be required).

See [DATA_ACCESS.md](./DATA_ACCESS.md).

## Open Dental → GoHighLevel

`npm run sync:od-ghl` polls MySQL and upserts one GoHighLevel contact per changed patient. A no-show confirmation adds one of `NO SHOWED AOX`, `NO SHOWED IMP`, `NO SHOWED OTN`, `NO SHOWED UTN`, or `NO SHOWED DENT`. Show, cancel, reschedule, and a completed sold code remove that tag. Booked consults create or match the contact and do not add a tag.

The first run only writes a cursor in `data/od-ghl-sync.json` (PatNum and contact id). It does not backfill old patients. Names, phones, and emails are not stored. GoHighLevel should run one workflow on those no-show tags, not a second workflow on contact create.

Run it every 5 minutes on the office host that can reach MySQL, from the app directory:

```bat
schtasks /Create /SC MINUTE /MO 5 /TN "Texoma OD to GHL" /TR "cmd /c cd /d D:\texoma-monorepo-main\texoma-monorepo-main && npm run sync:od-ghl"
```

Requires `OD_MYSQL_*` plus GoHighLevel credentials (`GHL_API_KEY` and `GHL_LOCATION_ID`, or Settings). Optional `GHL_OD_PATNUM_FIELD_ID` stores `od_pat_num` on the contact.
