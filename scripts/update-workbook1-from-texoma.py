#!/usr/bin/env python3
"""
Populate Open Dental procedure-code import workbook (Workbook1.xlsx format).

Default (--funnel-only): New Codes tab subset only — consults, 66–69, U-sold, TC codes.

Outputs:
  - Excel workbook (Open Dental import format)
  - texoma-funnel-procedure-codes.xml (Lists > Import/Export > Import)

Usage:
  python scripts/update-workbook1-from-texoma.py [output.xlsx] [template.xlsx]
  python scripts/update-workbook1-from-texoma.py --all [output.xlsx] [template.xlsx]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Downloads" / "TEXOMA OPEN DENTAL CODES 8-11-26.xlsx"
DEFAULT_WORKBOOK = Path.home() / "Documents" / "Workbook1.xlsx"
EXPORT_DIR = ROOT / "exports" / "open-dental"
FUNNEL_XML_NAME = "texoma-funnel-procedure-codes.xml"
PROCCAT_JSON = ROOT / "exports" / "open-dental" / "existing-proccat-by-code.json"

# Dashboard category -> default ProcCat when code/base not in Open Dental snapshot.
CATEGORY_PROCCAT: dict[str, int] = {
    "Extractions": 74,
    "Implants": 79,
    "Dentures": 377,
    "Partial Dentures": 399,
    "Other Surgery": 74,
    "Restorative Dentistry": 74,
    "Fixed (All-on-4)": 79,
    "Hygiene": 85,
    "Consult / Funnel": 85,
    "Sold Tracking": 114,
    "Attendance Tracking": 85,
    "Treatment Coordinator": 114,
}

# New Codes tab — funnel-only import (matches Code Chart "New Codes" screenshot).
FUNNEL_ONLY_CODES: list[tuple[str, str, str]] = [
    # Consult appointment types
    ("N9310AOX", "ALL ON X Consult", "Consult / Funnel"),
    ("N9310IMP", "Snap in denture", "Consult / Funnel"),
    ("N9310.OTN", "Over 10k+ Treatment Consult", "Consult / Funnel"),
    ("N9310.UTN", "Under 10k+ Treatment Consult", "Consult / Funnel"),
    ("N9310DENT", "Dentures Consult", "Consult / Funnel"),
    # 66 — cancelled by team
    ("66 AOX Cancel", "AOX Cancelled by Team", "Attendance Tracking"),
    ("66 IMPCANCEL", "IMP Cancelled by Team", "Attendance Tracking"),
    ("66OTN", "OVER 10K Cancelled by Team", "Attendance Tracking"),
    ("66UTN", "Under 10k cancelled by team", "Attendance Tracking"),
    ("66 DENT CANC", "Dentures Cancelled by Team", "Attendance Tracking"),
    # 67 — cancelled by patient
    ("67 AOX Cancel", "AOX Cancelled by Patient", "Attendance Tracking"),
    ("67 IMP CANCEL", "IMP Cancelled by Patient", "Attendance Tracking"),
    ("67OTN", "OVER 10K Cancelled by Patient", "Attendance Tracking"),
    ("67UTN", "Under 10k cancelled by patient", "Attendance Tracking"),
    # 68 — rescheduled
    ("68 AOX RESCH", "AOX Rescheduled by Patient", "Attendance Tracking"),
    ("68 IMP RESC", "IMP Rescheduled by Patient", "Attendance Tracking"),
    ("68OTN", "OVER 10K Rescheduled by pt", "Attendance Tracking"),
    ("68UTN", "Under 10k Rescheduled by pt", "Attendance Tracking"),
    ("68 DENT RESCH", "Dentures Rescheduled by Patient", "Attendance Tracking"),
    # 69 — no-show
    ("69 AOX NO SHOW", "AOX No-Showed", "Attendance Tracking"),
    ("69 IMPLANT NOSH", "IMP No-Showed", "Attendance Tracking"),
    ("69OTN", "OVER 10K no showed", "Attendance Tracking"),
    ("69UTN", "Under 10k no showed", "Attendance Tracking"),
    ("69 DENT", "Dentures No-Showed", "Attendance Tracking"),
    # Sold / same-day tracking (U-codes)
    ("U-AOXS", "Single arch - sold (AOX)", "Sold Tracking"),
    ("U-AOXD", "Double arch - sold (AOX)", "Sold Tracking"),
    ("U-OTN", "OVER 10K - sold", "Sold Tracking"),
    ("U-UTN", "UNDER 10K - sold", "Sold Tracking"),
    ("U-DENTS", "Single arch - sold (dentures)", "Sold Tracking"),
    ("U-DENTD", "Double arch - sold (dentures)", "Sold Tracking"),
    ("U-SNAPS", "Single arch - sold (snap-in)", "Sold Tracking"),
    ("U-SNAPD", "Double arch - sold (snap-in)", "Sold Tracking"),
    ("U-IMP", "Single implant - sold", "Sold Tracking"),
    # Treatment coordinators
    ("N9210", "Ashlie - Treatment Coordinator", "Treatment Coordinator"),
    ("N9410", "Brie - Treatment Coordinator", "Treatment Coordinator"),
    ("N9510", "Asst/Other - Treatment Coordinator", "Treatment Coordinator"),
]

SKIP_NEW_CODE_LABELS = {
    "code",
    "new appointment",
    "sold",
    "we have 3 sold codes",
    "treatment coordinators",
    "by end of day",
    "show rate\\",
    "no show rate",
    "show day = sold date",
    "nan",
}


def abbr(description: str, code: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", description or code)
    if not words:
        return code[:5]
    short = "".join(w[0] for w in words[:4]).upper()
    return (short or code)[:5]


def xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_od_xml(codes: pd.DataFrame) -> str:
    """Open Dental procedure code XML (ArrayOfProcedureCode)."""
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<ArrayOfProcedureCode>",
    ]
    for row in codes.itertuples(index=False):
        code = str(row.code).strip()
        description = str(row.description or code).strip()
        lines.extend(
            [
                "  <ProcedureCode>",
                f"    <ProcCode>{xml_escape(code)}</ProcCode>",
                f"    <Descript>{xml_escape(description)}</Descript>",
                f"    <AbbrDesc>{xml_escape(abbr(description, code))}</AbbrDesc>",
                "    <ProcTime>/X/</ProcTime>",
                "    <NoBillIns>false</NoBillIns>",
                "    <IsHygiene>false</IsHygiene>",
                "  </ProcedureCode>",
            ],
        )
    lines.append("</ArrayOfProcedureCode>")
    return "\n".join(lines) + "\n"


def write_xml_exports(codes: pd.DataFrame) -> list[Path]:
    """Write funnel XML to exports/ and Documents for easy OD import."""
    xml_text = build_od_xml(codes)
    paths = [
        EXPORT_DIR / FUNNEL_XML_NAME,
        Path.home() / "Documents" / FUNNEL_XML_NAME,
    ]
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(xml_text, encoding="utf-8")
    return paths


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
            rows.append({"category": category, "code": code, "description": description})
    return pd.DataFrame(rows)


def classify_new_code(code: str, description: str) -> str:
    upper = code.upper()
    desc = (description or "").lower()
    if upper.startswith("N9310") or "consult" in desc:
        return "Consult / Funnel"
    if upper.startswith("U-"):
        return "Sold Tracking"
    if re.match(r"^6[6789]", upper) or re.match(r"^6[6789]\b", upper):
        return "Attendance Tracking"
    if upper.startswith("N9210") or upper.startswith("N9410") or upper.startswith("N9510"):
        return "Treatment Coordinator"
    return "Consult / Funnel"


def normalize_proc_code(raw: str, description: str) -> tuple[str, str]:
    """Return (ProcCode, Descript) for Open Dental import."""
    text = raw.strip()
    desc = (description or "").strip()

    # U-AOXS - Single arch
    u_match = re.match(r"^(U-[A-Z]+)\s*(?:-\s*(.+))?$", text, re.I)
    if u_match:
        code = u_match.group(1).upper()
        suffix = (u_match.group(2) or "").strip()
        full_desc = f"{code} — {suffix}" if suffix else code
        if desc and desc.upper() != code:
            full_desc = f"{full_desc} ({desc})" if suffix else desc
        return code, full_desc[:255]

    # N9310 AOX Consult → N9310AOX (keep dotted variants as-is)
    if text.upper().startswith("N9310"):
        if "." in text.split()[0]:
            code = text.split()[0].upper().replace(" ", "")
        elif "AOX" in text.upper():
            code = "N9310AOX"
        elif "IMP" in text.upper():
            code = "N9310IMP"
        elif "DENT" in text.upper():
            code = "N9310DENT"
        else:
            code = re.sub(r"\s+", "", text.upper())[:15]
        full_desc = desc or text
        return code[:15], full_desc[:255]

    # 66 / 67 / 68 / 69 — keep short base codes; variants use readable suffix
    variant = re.match(r"^(6[6789])\s*(.*)$", text, re.I)
    if variant and text not in {"66", "67", "68", "69"}:
        base = variant.group(1)
        tail = re.sub(r"[^A-Z0-9]", "", (variant.group(2) or "").upper())[:9]
        code = f"{base}{tail}"[:15]
        full_desc = desc or text
        return code, full_desc[:255]

    # N9210-Ashlie coordinator codes
    if re.match(r"^N9\d{3}-", text, re.I):
        code = text.upper().replace(" ", "")[:15]
        return code, (desc or text)[:255]

    code = text.upper().replace(" ", "")[:15] if " " in text else text.upper()[:15]
    return code, (desc or text)[:255]


def load_new_codes_tab(xlsx: Path) -> pd.DataFrame:
    raw = pd.read_excel(xlsx, sheet_name="New Codes", header=None)
    rows: list[dict[str, str]] = []
    for i in range(len(raw)):
        c0 = raw.iloc[i, 0]
        c1 = raw.iloc[i, 1] if raw.shape[1] > 1 else None
        if pd.isna(c0):
            continue
        raw_code = str(c0).strip()
        if not raw_code or raw_code.lower() in SKIP_NEW_CODE_LABELS:
            continue
        if raw_code.lower() in {"arthur", "rohit", "felipe", "kena", "marian", "gaby"}:
            continue
        if re.match(r"^\d{4}-\d{2}-\d{2}", raw_code):
            continue
        description = "" if pd.isna(c1) else str(c1).strip()
        # Skip example / coordinator matrix rows (e.g. "N9310 AOX Consult | N9310 IMP Consult").
        if description.upper().startswith("N9310") and description.upper() != raw_code.upper():
            continue
        code, descript = normalize_proc_code(raw_code, description)
        if not description and code in {"66", "67", "68", "69"}:
            descript = {
                "66": "Cancelled by team",
                "67": "Cancelled by patient",
                "68": "Rescheduled",
                "69": "No-Show",
            }.get(code, descript)
        category = classify_new_code(code, descript)
        rows.append(
            {
                "category": category,
                "code": code,
                "description": descript,
            },
        )
    return pd.DataFrame(rows)


def merge_code_frames(*frames: pd.DataFrame) -> pd.DataFrame:
    by_code: dict[str, dict[str, str]] = {}
    for frame in frames:
        for row in frame.itertuples(index=False):
            code = str(row.code).strip().upper()
            if not code:
                continue
            description = str(getattr(row, "description", "") or "").strip()
            category = str(getattr(row, "category", "") or "").strip()
            prev = by_code.get(code)
            if prev is None:
                by_code[code] = {"code": code, "category": category, "description": description}
            else:
                if description and (
                    not prev["description"] or len(description) > len(prev["description"])
                ):
                    prev["description"] = description
                if category and not prev["category"]:
                    prev["category"] = category
    out = pd.DataFrame(by_code.values())
    return out.sort_values("code").reset_index(drop=True)


def load_proccat_map() -> dict[str, int]:
    if not PROCCAT_JSON.is_file():
        return {}
    return {
        k.upper(): int(v)
        for k, v in json.loads(PROCCAT_JSON.read_text(encoding="utf-8")).items()
    }


def resolve_proccat(code: str, category: str, proccat_map: dict[str, int]) -> int:
    upper = code.upper()
    if upper in proccat_map:
        return proccat_map[upper]
    base = upper.split(".", 1)[0]
    if base in proccat_map:
        return proccat_map[base]
    return CATEGORY_PROCCAT.get(category, 74)


def load_workbook_template(workbook: Path) -> tuple[list[str], dict]:
    tpl = pd.read_excel(workbook, sheet_name="Sheet1")
    columns = list(tpl.columns)
    defaults = tpl.iloc[0].to_dict() if len(tpl) > 0 else {}
    return columns, defaults


def build_import_rows(
    codes: pd.DataFrame,
    columns: list[str],
    defaults: dict,
    proccat_map: dict[str, int],
    *,
    only_missing: bool,
) -> pd.DataFrame:
    rows: list[dict] = []
    existing = set(proccat_map.keys())

    for row in codes.itertuples(index=False):
        code = row.code
        if only_missing and code in existing:
            continue
        category = row.category
        description = row.description or code
        proc_cat = resolve_proccat(code, category, proccat_map)
        is_hygiene = category == "Hygiene"

        record = {col: defaults.get(col) for col in columns}
        record.update(
            {
                "IsNew": True,
                "CodeNum": 0,
                "ProcCode": code,
                "Descript": description,
                "AbbrDesc": abbr(description, code),
                "ProcTime": "/X/",
                "ProcCat": proc_cat,
                "NoBillIns": False,
                "IsProsth": False,
                "IsHygiene": is_hygiene,
                "GTypeNum": 0,
                "IsTaxed": False,
                "IsCanadianLab": False,
                "PreExisting": False,
                "BaseUnits": 0,
                "SubstOnlyIf": "Always",
                "IsMultiVisit": False,
                "ProvNumDefault": 0,
                "CanadaTimeUnits": 0,
                "IsRadiology": False,
                "BypassGlobalLock": "NeverBypass",
                "AreaAlsoToothRange": False,
                "GraphicColor": 0,
            },
        )
        rows.append(record)

    return pd.DataFrame(rows, columns=columns)


def load_funnel_only_codes() -> pd.DataFrame:
    return pd.DataFrame(
        [{"code": c, "description": d, "category": cat} for c, d, cat in FUNNEL_ONLY_CODES],
    )


def parse_args() -> tuple[Path, Path, Path, bool]:
    args = [a for a in sys.argv[1:] if a.strip()]
    funnel_only = True
    if args and args[0] == "--all":
        funnel_only = False
        args = args[1:]

    output = Path(args[0]) if len(args) > 0 else DEFAULT_WORKBOOK
    template = Path(args[1]) if len(args) > 1 else DEFAULT_WORKBOOK
    source = Path(args[2]) if len(args) > 2 else DEFAULT_SOURCE
    return output, template, source, funnel_only


def main() -> None:
    output, template, source, funnel_only = parse_args()

    if not template.is_file():
        raise SystemExit(f"Template workbook not found: {template}")

    if funnel_only:
        merged = load_funnel_only_codes()
        only_missing = False
    else:
        if not source.is_file():
            raise SystemExit(f"Source Excel not found: {source}")
        flat = load_flat_list(source)
        chart = load_code_chart_pairs(source)
        funnel = load_new_codes_tab(source)
        merged = merge_code_frames(flat, chart, funnel)
        only_missing = True

    proccat_map = load_proccat_map()
    columns, defaults = load_workbook_template(template)
    import_df = build_import_rows(
        merged,
        columns,
        defaults,
        proccat_map,
        only_missing=only_missing,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        import_df.to_excel(writer, sheet_name="Sheet1", index=False)
        pd.DataFrame().to_excel(writer, sheet_name="Sheet2", index=False)
        pd.DataFrame().to_excel(writer, sheet_name="Sheet3", index=False)

        ws = writer.sheets["Sheet1"]
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 48)

    mode = "funnel-only (New Codes tab)" if funnel_only else "full chart"
    print(f"Mode: {mode}")
    if not funnel_only:
        print(f"Source: {source}")
    print(f"Template: {template}")
    print(f"Codes in export: {len(merged)}")
    if not funnel_only:
        print(f"Existing in Open Dental snapshot: {len(proccat_map)}")
    print(f"Wrote {len(import_df)} rows to {output}")

    xml_source = import_df.rename(columns={"ProcCode": "code", "Descript": "description"})
    xml_paths = write_xml_exports(xml_source[["code", "description"]])
    for path in xml_paths:
        print(f"Wrote XML ({len(xml_source)} codes) to {path}")


if __name__ == "__main__":
    main()
