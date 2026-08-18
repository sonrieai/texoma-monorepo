#!/usr/bin/env python3
"""
Regenerate dashboard CDT map + Open Dental import helpers from:
  Dental_Procedure_Code_Chart_CDT2026.xlsx  (sheet: Flat List (for import))

Usage:
  python scripts/sync-cdt-from-xlsx.py
  python scripts/sync-cdt-from-xlsx.py "C:/Users/.../Dental_Procedure_Code_Chart_CDT2026.xlsx"

Outputs:
  src/lib/nexhealth/data/cdt-categories.json
  exports/open-dental/cdt-2026-procedure-codes.xml   (new codes only on OD import)
  exports/open-dental/cdt-2026-descriptions.tsv      (reference)
  exports/open-dental/retire-trial-codes.txt         (T/N trial codes to remove in OD)
  exports/open-dental/OpenDental_Procedure_Codes_Import_CDT2026.xlsx
  ~/Downloads/OpenDental_Procedure_Codes_Import_CDT2026.xlsx  (copy for easy access)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATES = [
    Path.home() / "Downloads" / "TEXOMA OPEN DENTAL CODES 8-11-26.xlsx",
    Path.home() / "Downloads" / "Dental_Procedure_Code_Chart_CDT2026.xlsx",
]
JSON_OUT = ROOT / "src" / "lib" / "nexhealth" / "data" / "cdt-categories.json"
EXPORT_DIR = ROOT / "exports" / "open-dental"

# Trial / custom codes seen on NexHealth sync (Open Dental demo DB) — retire via OD Tools.
TRIAL_CODES_TO_RETIRE = """
T1254 T1255 T1356 T1546 T1632 T1665 T1698 T2345 T3512 T3522 T3532 T3541 T3542 T3543
T3546 T4528 T4538 T4548 T4558 T5823 T5833 T5843 T5853 T6245 T6255 T6357 T6452 T6462
T6472 T6482 T6531 T7956 T7966 T7976 T8351 T8515 T8652 T9826 T9836 T9999
N1254 N1255 N4101 N4102 N4103 N4104 N4106 N4108 N4109 N4111 N4112 N4113 N4115 N4116
N4117 N4118 N4119 N4120 N4121 N4122 N4123 N4124 N4125 N4126 N4127 N4130 N4131 N4132
N4133 N4136 N4140 N4141 N5462
""".split()

AOX_CODES = ["D6114", "D6115", "D6116", "D6117"]
# Future sold-case tracking codes from Formulas / New Codes tabs.
AOX_SOLD_CODES = ["U-AOXS", "U-AOXD", "U-FMR"]

CATEGORY_ORDER = [
    "Extractions",
    "Implants",
    "Dentures",
    "Partial Dentures",
    "Other Surgery",
    "Restorative Dentistry",
    "Fixed (All-on-4)",
    "Hygiene",
]

# Suggested Open Dental procedure code category (Definitions: Proc Code Categories).
OD_CATEGORY_MAP: dict[str, str] = {
    "Extractions": "Oral Surgery",
    "Implants": "Implants",
    "Dentures": "Dentures",
    "Partial Dentures": "Dentures",
    "Other Surgery": "Oral Surgery",
    "Restorative Dentistry": "Fillings",
    "Fixed (All-on-4)": "Crown & Bridge",
    "Hygiene": "Cleanings",
}

XLSX_OUT_NAME = "OpenDental_Procedure_Codes_Import_CDT2026.xlsx"

VOLUME_BUCKET_BY_CATEGORY = {
    "Extractions": "extractions",
    "Implants": "implants",
    "Dentures": "dentures",
    "Fixed (All-on-4)": "aox",
}


def warranty_bucket(code: str, description: str) -> str | None:
    """Map Texoma denture warranty suffix codes → cockpit buckets."""
    upper = code.upper()
    base = upper.split(".", 1)[0]
    if base not in {"D5110", "D5120", "D5130", "D5140"}:
        return None
    text = description.lower()
    if "6-month" in text or "6 month" in text or upper.endswith(".1"):
        return "m6"
    if "1-year" in text or "1 year" in text or "1-yr" in text or upper.endswith(".4"):
        return "y1"
    if "3-year" in text or "3 year" in text or "3-yr" in text or "3 yr" in text or upper.endswith(".2"):
        return "y3"
    if "5-year" in text or "5 year" in text or "5-yr" in text or "5 yr" in text or upper.endswith(".3"):
        return "y5"
    return None


def volume_bucket(category: str, code: str) -> str | None:
    if code.upper() in AOX_CODES or category == "Fixed (All-on-4)":
        return "aox"
    return VOLUME_BUCKET_BY_CATEGORY.get(category)


def abbr(description: str, code: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", description)
    if not words:
        return code[:5]
    short = "".join(w[0] for w in words[:4]).upper()
    return (short or code)[:5]


def load_flat_list(xlsx: Path) -> pd.DataFrame:
    df = pd.read_excel(xlsx, sheet_name="Flat List (for import)")
    df = df.rename(
        columns={
            "Category": "category",
            "CDT Code": "code",
            "ADA Code Description": "description",
        },
    )
    df = df.dropna(subset=["code"])
    df["code"] = df["code"].astype(str).str.strip().str.upper()
    df["description"] = df["description"].astype(str).str.strip()
    df["category"] = df["category"].astype(str).str.strip()
    return df


def load_code_chart_pairs(xlsx: Path) -> pd.DataFrame:
    """Parse wide Code Chart sheet (includes SC suffix + warranty variants)."""
    try:
        raw = pd.read_excel(xlsx, sheet_name="Code Chart", header=None)
    except ValueError:
        return pd.DataFrame(columns=["category", "code", "description"])

    rows: list[dict[str, str]] = []
    for col in range(0, raw.shape[1], 2):
        category = None
        for c in range(col, -1, -1):
            v = raw.iloc[3, c] if raw.shape[0] > 3 else None
            if isinstance(v, str) and v.strip() and v.strip().lower() != "code":
                category = v.strip()
                break
        if not category:
            continue
        for r in range(5, len(raw)):
            code_cell = raw.iloc[r, col]
            if pd.isna(code_cell):
                continue
            code = str(code_cell).strip().upper()
            if not code or code == "NAN":
                continue
            desc_cell = raw.iloc[r, col + 1] if col + 1 < raw.shape[1] else None
            description = "" if pd.isna(desc_cell) else str(desc_cell).strip()
            rows.append(
                {
                    "category": category,
                    "code": code,
                    "description": description,
                },
            )
    return pd.DataFrame(rows)


def merge_code_frames(flat: pd.DataFrame, chart: pd.DataFrame) -> pd.DataFrame:
    by_code: dict[str, dict[str, str]] = {}
    for frame in (flat, chart):
        for row in frame.itertuples(index=False):
            code = str(row.code).strip().upper()
            if not code:
                continue
            prev = by_code.get(code)
            description = str(row.description or "").strip()
            category = str(row.category or "").strip()
            if prev is None:
                by_code[code] = {
                    "code": code,
                    "category": category,
                    "description": description,
                }
            else:
                if description and (
                    not prev["description"] or len(description) > len(prev["description"])
                ):
                    prev["description"] = description
                if category and not prev["category"]:
                    prev["category"] = category
    return pd.DataFrame(by_code.values())


def build_json(df: pd.DataFrame) -> dict:
    by_code: dict[str, dict[str, object]] = {}
    warranty_codes: dict[str, list[str]] = {
        "m6": [],
        "y1": [],
        "y3": [],
        "y5": [],
    }
    for row in df.itertuples(index=False):
        code = row.code
        category = row.category
        description = row.description
        w = warranty_bucket(code, description)
        vb = volume_bucket(category, code)
        entry: dict[str, object] = {
            "category": category,
            "description": description,
        }
        if vb:
            entry["volumeBucket"] = vb
        if w:
            entry["warrantyBucket"] = w
            warranty_codes[w].append(code)
        by_code[code] = entry

    # Placeholder sold-case codes for historical tracking (Formulas tab).
    for sold in AOX_SOLD_CODES:
        by_code.setdefault(
            sold,
            {
                "category": "Fixed (All-on-4)",
                "description": f"AOX sold case marker ({sold})",
                "volumeBucket": "aox",
                "isSoldCase": True,
            },
        )

    categories = [c for c in CATEGORY_ORDER if c in set(df["category"])]
    for c in sorted(set(df["category"]) - set(categories)):
        categories.append(c)
    return {
        "categories": categories,
        "aoxCodes": AOX_CODES,
        "aoxSoldCodes": AOX_SOLD_CODES,
        "warrantyCodes": warranty_codes,
        "byCode": by_code,
    }


def build_od_xml(df: pd.DataFrame) -> str:
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<ArrayOfProcedureCode>",
    ]
    for row in df.itertuples(index=False):
        desc = (
            row.description.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        lines.extend(
            [
                "  <ProcedureCode>",
                f"    <ProcCode>{row.code}</ProcCode>",
                f"    <Descript>{desc}</Descript>",
                f"    <AbbrDesc>{abbr(row.description, row.code)}</AbbrDesc>",
                "    <ProcTime>/X/</ProcTime>",
                "    <NoBillIns>false</NoBillIns>",
                "    <IsHygiene>false</IsHygiene>",
                "  </ProcedureCode>",
            ],
        )
    lines.append("</ArrayOfProcedureCode>")
    return "\n".join(lines) + "\n"


def build_od_import_rows(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for row in df.itertuples(index=False):
        is_hygiene = row.category == "Hygiene"
        rows.append(
            {
                "ProcCode": row.code,
                "Descript": row.description,
                "AbbrDesc": abbr(row.description, row.code),
                "OD Category (suggested)": OD_CATEGORY_MAP.get(row.category, row.category),
                "Dashboard Category": row.category,
                "ProcTime": "/X/",
                "NoBillIns": "false",
                "IsHygiene": "true" if is_hygiene else "false",
                "Fee (Office Fees)": "",
            },
        )
    return pd.DataFrame(rows)


def build_od_xlsx(df: pd.DataFrame, out_path: Path) -> None:
    import_rows = build_od_import_rows(df)
    fees_rows = import_rows[["ProcCode", "Fee (Office Fees)"]].rename(
        columns={"Fee (Office Fees)": "Fee"},
    )
    instructions = pd.DataFrame(
        {
            "Step": [1, 2, 3, 4, 5],
            "Action": [
                "Lists > Procedure Codes > Tools: check T codes (remove) and D codes (add ADA set), Run Now",
                "Import/Export > Import: use cdt-2026-procedure-codes.xml from exports/open-dental/",
                "Assign categories in OD if needed (see OD Category column on Procedure Codes sheet)",
                "Fill Fee column on Fees Import sheet, save sheet as tab-delimited .txt, Fee Tools > Import",
                "Restart NexHealth Synchronizer; verify D-codes appear in NexHealth",
            ],
            "Notes": [
                "Removes trial T-codes like T1356, T3541",
                "XML adds only codes not already in OD; existing codes are not updated",
                "Open Dental imports XML, not this xlsx directly — xlsx is for review and fees prep",
                "Fee import requires codes to exist first; no $ symbol in fee column",
                "NexHealth MCP list_appointment_descriptors is read-only verification",
            ],
        },
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        import_rows.to_excel(writer, sheet_name="Procedure Codes", index=False)
        fees_rows.to_excel(writer, sheet_name="Fees Import", index=False)
        instructions.to_excel(writer, sheet_name="Instructions", index=False)

        for sheet in ("Procedure Codes", "Fees Import", "Instructions"):
            ws = writer.sheets[sheet]
            for col in ws.columns:
                max_len = max(len(str(cell.value or "")) for cell in col)
                ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)


def main() -> None:
    if len(sys.argv) > 1:
        xlsx = Path(sys.argv[1])
    else:
        xlsx = next((p for p in DEFAULT_CANDIDATES if p.is_file()), DEFAULT_CANDIDATES[0])
    if not xlsx.is_file():
        raise SystemExit(f"Excel not found: {xlsx}")

    flat = load_flat_list(xlsx)
    chart = load_code_chart_pairs(xlsx)
    df = merge_code_frames(flat, chart)
    payload = build_json(df)

    JSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    (EXPORT_DIR / "cdt-2026-procedure-codes.xml").write_text(
        build_od_xml(df),
        encoding="utf-8",
    )
    tsv_lines = ["code\tdescription\tcategory"]
    for row in df.itertuples(index=False):
        tsv_lines.append(f"{row.code}\t{row.description}\t{row.category}")
    (EXPORT_DIR / "cdt-2026-descriptions.tsv").write_text(
        "\n".join(tsv_lines) + "\n",
        encoding="utf-8",
    )
    (EXPORT_DIR / "retire-trial-codes.txt").write_text(
        "\n".join(sorted(set(TRIAL_CODES_TO_RETIRE))) + "\n",
        encoding="utf-8",
    )

    xlsx_out_repo = EXPORT_DIR / XLSX_OUT_NAME
    xlsx_out_downloads = Path.home() / "Downloads" / XLSX_OUT_NAME
    build_od_xlsx(df, xlsx_out_repo)
    build_od_xlsx(df, xlsx_out_downloads)

    print(f"Loaded {len(df)} CDT codes from {xlsx} (flat={len(flat)}, chart={len(chart)})")
    print(f"Wrote {JSON_OUT.relative_to(ROOT)}")
    print(f"Wrote exports under {EXPORT_DIR.relative_to(ROOT)}/")
    print(f"Wrote {xlsx_out_repo}")
    print(f"Wrote {xlsx_out_downloads}")
    print()
    print("Next steps (Open Dental - NexHealth MCP cannot change procedure codes):")
    print("  1. Lists > Procedure Codes > Tools (lower left)")
    print("     [x] T codes: Remove all temp (T) trial codes")
    print("     [x] D codes: Add missing ADA CDT codes (2026 when OD version supports it)")
    print("  2. Optional: Import/Export > import exports/open-dental/cdt-2026-procedure-codes.xml")
    print("     (only adds codes that do not already exist)")
    print("  3. Restart NexHealth Synchronizer; verify with MCP list_appointment_descriptors")
    print("  4. Restart dashboard dev server - cockpit charts use cdt-categories.json")
    print("  5. npm run sync:nexhealth — push NexHealth ledger into MongoDB warehouse")


if __name__ == "__main__":
    main()
