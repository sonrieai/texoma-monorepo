# Office LAN install (Open Dental Windows Server)

Install **this** Next.js Texoma dashboard on the Open Dental server for
office-LAN access only. This is **not** the old `KPI-Dashboard-for-IT.zip`
(different env names, SQLite logins, port packaging).

```text
Office PCs (LAN)
        │  http://SERVER:8080
        ▼
Next.js (npm run start:lan)  ──Mongo Atlas──► login + GHL settings
        │
        │  OD_MYSQL_* → 127.0.0.1 SELECT-only
        ▼
Open Dental MySQL (same machine)
```

**Do not** point Vercel/Netlify at office MySQL. Cloud hosts cannot reach an
office-only database. Clinical KPIs stay on the LAN (or VPN).

Related: [LOCAL_OPENDENTAL.md](./LOCAL_OPENDENTAL.md) (laptop trial),
[HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md), [SYNC_SCHEDULE.md](./SYNC_SCHEDULE.md).

---

## Prerequisites

- Windows Server (or Windows PC) that already runs Open Dental MySQL
- Admin rights for MySQL, firewall, and Windows services
- Node.js **24.x** ([nodejs.org](https://nodejs.org/))
- [NSSM](https://nssm.cc/) for the Windows service
- MongoDB Atlas URI for dashboard login (not clinical data)

---

## 13-step handoff

### 1. Confirm database from FreeDentalConfig.xml

On the OD server, open `FreeDentalConfig.xml` (usually next to `OpenDental.exe`).
Note:

- `ServerName` — usually `localhost` / `127.0.0.1` when the app runs on the same machine
- `DatabaseName` — often `opendental` (not the trial `demo`)

### 2. Create SELECT-only user `kpi_readonly`

As a MySQL admin, edit and run
[`scripts/sql/create-kpi-readonly.sql`](../scripts/sql/create-kpi-readonly.sql):

- Replace `CHANGE_ME_PASSWORD`
- Replace `opendental` with `DatabaseName` from step 1 if different
- **Never** use `root` as the dashboard MySQL user

### 3. Install Node 24

Install Node.js 24.x system-wide. Confirm:

```powershell
node -v   # v24.x
npm -v
```

### 4. Copy this repo to the server

Clone or copy **this** project (not the old KPI zip) to e.g.
`C:\texoma-dashboard`.

### 5. Install and build

```powershell
cd C:\texoma-dashboard
npm ci
npm run build
```

### 6. Write `.env.local`

```env
OD_MYSQL_HOST=127.0.0.1
OD_MYSQL_PORT=3306
OD_MYSQL_USER=kpi_readonly
OD_MYSQL_PASS=<password from step 2>
OD_MYSQL_DB=<DatabaseName from step 1>

MONGODB_URI=mongodb+srv://...
MONGODB_DB=texoma

AUTH_EMAIL=owner@yourpractice.com
AUTH_PASSWORD=<temporary strong password>
AUTH_SESSION_SECRET=<at-least-32-random-chars>
AUTH_USERNAME=admin
```

Optional: `GHL_*` for Marketing / TC. Clinical KPIs do not need Mongo warehouse
collections.

### 7. Probe and validate

```powershell
npm run probe:opendental-mysql
npm run validate:opendental
```

Gates:

- `connected: true`, `ok: true`
- `grants: SELECT-only`
- Snapshot sanity prints provider / procedure counts and current-month
  production **cents** (no patient names)

Compare Overview later to Open Dental Production / A/R reports.

### 8. Firewall — port 8080 LocalSubnet only

As Administrator:

```powershell
.\scripts\office\install-firewall.ps1
```

Inbound TCP **8080**, remote address **LocalSubnet**, Domain/Private profiles.
Do **not** open to Any / public internet.

### 9. Windows service (NSSM)

As Administrator (after `npm ci` + `npm run build`):

```powershell
.\scripts\office\install-service.ps1 -InstallDir C:\texoma-dashboard
```

Service name: `TexomaKPI`. It runs `npm run start:lan` (`0.0.0.0:8080`).

### 10. Backup `.env.local`

```powershell
.\scripts\office\backup-env.ps1 -InstallDir C:\texoma-dashboard
```

Store the backup offline / restricted. Logins live in Mongo Atlas (no local
SQLite `data\` folder).

### 11. Open from an office PC

```text
http://<SERVER-IP-OR-HOSTNAME>:8080/login
```

### 12. First owner password

If `dashboard_users` is empty, `AUTH_EMAIL` + `AUTH_PASSWORD` seed the first
admin on login. Owner should change the password in-app (or via forgot-password
if Mailgun is configured). There is **no** `npm run user` / SQLite CLI in this
repo.

### 13. Confirm SELECT-only in production

Re-run:

```powershell
npm run probe:opendental-mysql
```

Confirm `grantsReadonly: true` (printed as SELECT-only). Fix grants before
leaving the server.

---

## Day-2 operations

| Task | Command / note |
|------|----------------|
| Service status | `Get-Service TexomaKPI` |
| Logs | `C:\texoma-dashboard\logs\service-*.log` |
| Redeploy | stop service → `git pull` / copy → `npm ci` → `npm run build` → start |
| Env backup | `.\scripts\office\backup-env.ps1` |
| Health | `GET http://SERVER:8080/api/health/opendental-mysql` (auth required if enabled) |

---

## Security checklist

- [ ] `kpi_readonly` has SELECT only
- [ ] Firewall LocalSubnet only (not Any)
- [ ] `.env.local` not in git; backups restricted
- [ ] Mongo holds login + GHL only — no clinical warehouse
- [ ] No Vercel/Netlify pointing at office MySQL
- [ ] HIPAA runbook: [HIPAA_NO_EPHI.md](./HIPAA_NO_EPHI.md)
