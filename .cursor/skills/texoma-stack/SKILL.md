---
name: texoma-stack
description: >-
  Texoma BI Dashboard stack: Next.js App Router + TypeScript + Tailwind,
  Open Dental MySQL live reads and GoHighLevel adapters.
  Use when writing or reviewing routes, metrics, UI pages, or integrations.
---

# Texoma Stack

## Layout

- `src/app` — App Router pages + Route Handlers (`api/`)
- `src/components` — presentational UI (KPI, charts, shell, map)
- `src/lib/opendental` — server-only Open Dental MySQL queries, mappers, live snapshot
- `src/lib/warehouse` — source-neutral metric and record logic
- `src/lib/ghl` — GoHighLevel adapter (stub until keys land)
- `src/lib/metrics` — derived KPIs (integer cents where money); never recompute in the client as source of truth
- `src/lib/mock` — demo fallback from Canva/HTML mockup
- `docs/` — DATA_ACCESS and FIELD_MAP for discovery

## Backend pattern (Route Handlers)

```
route (thin) → metrics/mapper → opendental snapshot | ghl client
```

- Business/derived numbers live in `lib/metrics/` or mappers — not in React components
- Secrets only via env; never expose API keys to the browser
- On missing key or upstream failure: fall back to mock data so UI still demos

## Frontend

- Tailwind utilities + CSS variables from the implant-practice mockup theme
- Every data view: loading, success, empty, error, retry
- Display metrics from API / server loaders — do not invent money math client-side

## External

- Open Dental: `OD_MYSQL_HOST`, `OD_MYSQL_USER`, `OD_MYSQL_PASS`, `OD_MYSQL_DB`
- GHL (later): `GHL_API_KEY`, `GHL_LOCATION_ID`
