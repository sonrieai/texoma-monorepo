# Open Dental procedure codes (CDT 2026) + Open Dental

The dashboard **does not** store procedure codes. It maps **live** Open Dental `procedure_code` / charge codes to KPI categories using `src/lib/cdt/data/cdt-categories.json`, generated from `Dental_Procedure_Code_Chart_CDT2026.xlsx`.

KPI formulas (NP, AOX sold, denture delivery, remakes, etc.) vs current code: [DATA_ACCESS.md](./DATA_ACCESS.md#formulas-tab--code-mapping). Questions for Dr: [FORMULAS_DR_QUESTIONS.md](./FORMULAS_DR_QUESTIONS.md).

**Open Dental MCP cannot add, edit, or delete procedure codes.**
`list_appointment_descriptors` is read-only — codes sync **from Open Dental** via the Synchronizer.

Your trial/demo Open Dental database uses **T-codes** (e.g. `T1356` Exam, `T3541` Prophy). The cockpit chart expects **D-codes** (e.g. `D0120`, `D1110`).

---

## 1. Regenerate dashboard map from Excel

From repo root (Excel default path: Downloads):

```powershell
python scripts/sync-cdt-from-xlsx.py "C:\Users\RohitSahu\Downloads\Dental_Procedure_Code_Chart_CDT2026.xlsx"
```

This writes:

| Output | Purpose |
|--------|---------|
| `src/lib/cdt/data/cdt-categories.json` | Dashboard production / volume / category donuts |
| `exports/open-dental/cdt-2026-procedure-codes.xml` | Optional OD import (new codes only) |
| `exports/open-dental/cdt-2026-descriptions.tsv` | Human reference |
| `exports/open-dental/retire-trial-codes.txt` | Trial T/N codes to remove |

---

## 2. Replace codes in Open Dental (required)

In Open Dental: **Lists → Procedure Codes**

### A. Recommended: Procedure Code Tools

Click **Tools** (lower left). Check:

1. **T codes** — Remove all temp (T) codes installed with the trial version  
2. **D codes** — Add missing ADA CDT codes and set descriptions to defaults  

Click **Run Now**.

Reference: [Open Dental Procedure Code Tools](https://www.opendental.com/manual/procedurecodetools.html)

> Use **D codes** after your Open Dental version supports **CDT 2026** (check for a year-end update). Until then, run **D codes** to add the latest CDT your OD build includes.

### B. Optional: XML import (Texoma subset only)

**Import/Export → Import** → select `exports/open-dental/cdt-2026-procedure-codes.xml`

- Imports only codes **not already** in the database  
- Does **not** update existing codes or remove T-codes  

Use **Tools → T codes** to remove trial codes first.

### C. Fees

After D-codes exist, enter or import fees under **Fee Tools** (tab-delimited: `Code<TAB>Fee`). Fees import does **not** create codes.

---

## 3. Verify via the read-only MySQL connection

1. Run `npm run probe:opendental-mysql`.
2. Inspect the procedure-code settings page in the dashboard.

After OD sync you should see **D** procedure codes (e.g. `D7140`) instead of **T** codes (`T1356`).

---

## 4. Verify dashboard

1. Restart `npm run dev`
2. Open **Overview** → Production by category donut should fill when charges use D-codes
3. **Unmapped production codes** table should shrink as T-codes are retired

---

## Current sync snapshot (Relaxation Dental / demo)

Open Dental still lists trial-style codes including `T1356`, `T3541`, `T5833`, etc.
That matches Open Dental **before** Procedure Code Tools are run — not a dashboard bug.

After you run OD Tools + Synchronizer, re-run `list_appointment_descriptors` to confirm D-codes appear.
