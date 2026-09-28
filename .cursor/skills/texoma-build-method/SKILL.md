---
name: texoma-build-method
description: >-
  Texoma dashboard phased build method and phase gates. Use when starting a
  feature, PR, or deciding whether to advance to the next delivery stage.
---

# Texoma Build Method

## Agent checklist

```
1. Name the phase + invariant under test
2. Read texoma-stack (+ docs/DATA_ACCESS.md) before touching integrations
3. Implement server client/mapper FIRST for live data paths
4. Wire Route Handler + page UI against locked contracts
5. Run phase gate checklist; do not start next phase until gate passes
```

## Phase gates

| Phase | Must pass before next |
|-------|------------------------|
| 0 Scaffold | Next.js boots; skills/rules present; mock Overview renders |
| 1 Open Dental discovery | Read-only MySQL appointments/providers/patients reachable; show/no-show field map drafted |
| 2 Overview UI | Hybrid live + mock cockpit matches mockup layout |
| 3 Marketing / GHL | Stub → live leads, spend, funnel; CPL / ROI from metrics lib |
| 4 Geo | Patients-by-area heat map from Open Dental city/ZIP |
| 5 Write-back | Appointment + new-patient source attribution into the EHR |

## Soft launch

One practice / location after phases 0–4; PHI logging disabled; env secrets in host vault only.
