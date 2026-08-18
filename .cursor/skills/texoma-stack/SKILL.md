---
name: texoma-stack
description: >-
  Texoma BI Dashboard stack: Next.js App Router + TypeScript + Tailwind,
  NexHealth (Open Dental via Synchronizer) and GoHighLevel adapters.
  Use when writing or reviewing routes, metrics, UI pages, or integrations.
---

# Texoma Stack

## Layout

- `src/app` — App Router pages + Route Handlers (`api/`)
- `src/components` — presentational UI (KPI, charts, shell, map)
- `src/lib/nexhealth` — server-only NexHealth client (auth, list, write-back)
- `src/lib/ghl` — GoHighLevel adapter (stub until keys land)
- `src/lib/metrics` — derived KPIs (integer cents where money); never recompute in the client as source of truth
- `src/lib/mock` — demo fallback from Canva/HTML mockup
- `docs/` — DATA_ACCESS and FIELD_MAP for discovery

## Backend pattern (Route Handlers)

```
route (thin) → metrics/mapper → nexhealth|ghl client
```

- Business/derived numbers live in `lib/metrics/` or mappers — not in React components
- Secrets only via env; never expose API keys to the browser
- On missing key or upstream failure: fall back to mock data so UI still demos

## Frontend

- Tailwind utilities + CSS variables from the implant-practice mockup theme
- Every data view: loading, success, empty, error, retry
- Display metrics from API / server loaders — do not invent money math client-side

## External

- NexHealth: `NEXHEALTH_API_KEY`, `NEXHEALTH_SUBDOMAIN`, `NEXHEALTH_LOCATION_ID`, `NEXHEALTH_BASE_URL`
- GHL (later): `GHL_API_KEY`, `GHL_LOCATION_ID`
