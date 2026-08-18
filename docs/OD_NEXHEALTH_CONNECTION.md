# Open Dental → NexHealth → Dashboard

Canonical EHR path for Texoma:

```text
Open Dental (MySQL/MariaDB on Windows)
        │
        │  NexHealth Synchronizer (Windows service on the OD server)
        ▼
NexHealth Cloud + API  (https://nexhealth.info)
        │
        │  this app: src/lib/nexhealth + NEXHEALTH_* env
        ▼
Texoma Dashboard
```

The dashboard never connects to MySQL or Open Dental directly. If Synchronizer is not installed and linked, local OD data will not appear in the app.

**Current dashboard env** still points at Sonrie’s existing sandbox (`sonrie-demo-practice` / location `331107` — Green River Dental). That is **not** your laptop’s OD until you create a new Open Dental sync and point `.env.local` at the new `subdomain` / `location_id`.

Official NexHealth guide: [Setting up an Open Dental Sandbox Sync](https://docs.nexhealth.com/docs/setting-up-an-open-dental-sandbox-sync)  
Installer download: [https://www.nexhealth.com/download](https://www.nexhealth.com/download)  
General Synchronizer install: [Installing the NexHealth Synchronizer](https://docs.nexhealth.com/docs/nexhealth-synchronizer-installation-guide-1)

---

## Local laptop path (Open Dental Trial + your MySQL)

NexHealth’s docs use the [Open Dental trial](https://www.opendental.com/site/trial.html) as a **dev sandbox**. They connect via the **Synchronizer product key**, not by calling OD’s public API from this Next.js app.

OD’s own trial page still says *“does not work with API / eServices”* — that means OD’s own eServices/API products. The Synchronizer is a separate NexHealth Windows install that reaches the practice database.

### Prerequisites (you already have most of these)

1. Windows machine (OD is Windows-only for on-prem).
2. Open Dental installed as **Server** (program + MySQL/MariaDB + database).
3. You can open OD against your DB (blank `opendental` or `demo`) with the MySQL password you set.
4. Access to a **NexHealth Developer Portal** account that can create an institution sync (same place your sandbox API key came from — ask Arthur / Sonrie if you only have an API key and no portal login).

### Step A — Create an Open Dental sync in NexHealth portal

1. Log into the [NexHealth Developer Portal](https://docs.nexhealth.com/docs/getting-started).
2. Open your sandbox institution (often named like *YourCompany Demo Practice*).
3. Click **Create new sync** → choose **Open Dental** → Save.
4. Copy the **product key** shown under that sync (required by the installer).

### Step B — Install Synchronizer on the same PC as Open Dental

1. On the OD machine, download Synchronizer: [https://www.nexhealth.com/download](https://www.nexhealth.com/download).
2. Run `NexHealth Synchronizer.exe` **as Administrator**.
3. Paste the **product key** from Step A → Continue.
4. Wait 10–30 minutes while it installs and reads historical data. Prefer waiting until you see **Close window**.
5. Refresh the Developer Portal — the location should show an **ID** and sync status.

Requirements note: OD **v17+** on the server is in NexHealth’s supported list. Middle-tier OD setups need a NexHealth engineer ([install guide](https://docs.nexhealth.com/docs/nexhealth-synchronizer-installation-guide-1)).

### Step C — Point this dashboard at *your* sync

1. In the portal, copy:
   - institution **subdomain**
   - **location_id** for the synced OD location
2. Update `.env.local`:

```env
NEXHEALTH_API_KEY=<your sandbox key>
NEXHEALTH_SUBDOMAIN=<your-institution-subdomain>
NEXHEALTH_LOCATION_ID=<new-location-id-from-portal>
NEXHEALTH_BASE_URL=https://nexhealth.info
NEXHEALTH_API_VERSION=v3.0.0
```

3. Restart the app (`npm run build` then `npm start`, or `npm run dev`).
4. Check `http://localhost:5000/api/health/nexhealth` → `"ok": true`.
5. Open Overview — appointments/providers should match what Synchronizer pulled from **your** OD (not Green River Dental).

### Step D — Sanity checks in Open Dental

- Create a test patient + appointment in OD.
- Wait for sync (often minutes; first full sync longer).
- Confirm the appointment appears via NexHealth (`/appointments`) and on Overview.

---

## What can still block you

| Blocker | What to do |
|---------|------------|
| No Developer Portal access (only API key) | Ask Sonrie/Arthur for portal login or for them to create an **Open Dental** sync and send you the **product key** + new location id |
| Synchronizer on wrong machine | Must run on the Windows box that hosts the OD **database** (your server install) |
| Expecting dashboard → MySQL | Won’t happen by design — always OD → Synchronizer → NexHealth API → dashboard |
| Want Texoma production data | Needs the **practice** OD server + Synchronizer + production institution credentials, not your laptop trial |

---

## Recommended for day-to-day dashboard work

| Goal | Use |
|------|-----|
| Build KPIs / UI now | Keep current Sonrie key (`sonrie-demo-practice`) until your OD sync is green |
| Prove laptop OD → NexHealth | Follow Steps A–D above |
| Texoma live | Practice IT installs Synchronizer on **their** OD server |

---

## Action checklist

1. Confirm you can open local OD + MySQL (done).
2. Get Developer Portal access + create **Open Dental** sync → product key.
3. Install Synchronizer with that key on the OD PC.
4. Wait until portal shows location ID / healthy sync.
5. Put new `NEXHEALTH_SUBDOMAIN` + `NEXHEALTH_LOCATION_ID` in `.env.local`.
6. Restart dashboard and verify `/api/health/nexhealth` + Overview.
