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
