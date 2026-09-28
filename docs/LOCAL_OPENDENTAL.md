# Local Open Dental deployment (MySQL → dashboard)

Canonical local path:

```text
Open Dental MySQL (trial, restored backup, or office server over VPN)
        │  SELECT-only queries on page load
        ▼
src/lib/opendental/*  →  KPI aggregators
        │
        ▼
Dashboard pages (npm run dev / npm start)
```

MongoDB is **not** used for clinical KPIs. It remains only for dashboard login
and encrypted GHL settings.

Office LAN install (Windows Server + NSSM): see [OFFICE_INSTALL.md](./OFFICE_INSTALL.md).

---

## A. Official Open Dental trial (laptop)

Match **Open Dental → Choose Database** in `.env.local`:

```env
OD_MYSQL_HOST=localhost
OD_MYSQL_PORT=3306
OD_MYSQL_USER=root
OD_MYSQL_PASS=          # password from Choose Database (required if MySQL rejects empty)
OD_MYSQL_DB=demo
```

Then:

```bash
npm run probe:opendental-mysql
npm run dev
```

Open `http://localhost:5001/overview`.

- Trial `root` is fine for **local demo only**. The probe will warn that grants are not SELECT-only.
- Do **not** use `root` on the office server — create `kpi_readonly` (see [OFFICE_INSTALL.md](./OFFICE_INSTALL.md)).

If probe says `Access denied ... (using password: NO)`, set `OD_MYSQL_PASS` to the Choose Database password and re-run the probe.

---

## B. Restore a practice backup (recommended for development)

1. Restore the client dump into a separate local MariaDB/MySQL database (never commit the dump).
2. Create a SELECT-only user:

```sql
CREATE USER 'texoma_dashboard'@'localhost' IDENTIFIED BY 'LONG-RANDOM-PASSWORD';
GRANT SELECT ON opendental.* TO 'texoma_dashboard'@'localhost';
FLUSH PRIVILEGES;
```

Or use the office template: [`scripts/sql/create-kpi-readonly.sql`](../scripts/sql/create-kpi-readonly.sql).

### Configure `.env.local`

```env
OD_MYSQL_HOST=127.0.0.1
OD_MYSQL_PORT=3306
OD_MYSQL_USER=texoma_dashboard
OD_MYSQL_PASS=LONG-RANDOM-PASSWORD
OD_MYSQL_DB=opendental
# OD_CLINIC_NUMS=1

WAREHOUSE_LOCATION_NAME=Texoma Local
```

### Probe then run the app

```bash
npm run probe:opendental-mysql
npm run validate:opendental
npm run dev
```

Open `/overview`. Pages query Open Dental directly; keep the connection
read-only and on a trusted network/VPN.
