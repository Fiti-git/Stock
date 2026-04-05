"""
XLS Import Engine for Arunalu Super Mart POS stock balance files.

Fixed column positions (0-indexed):
  Col 0  — item_code     (e.g. AR00003244, WGHE000380)
  Col 2  — item_name     (no header, position is fixed)
  Col 6  — cost_price    (LKR)
  Col 7  — selling_price (LKR)
  Col 8  — pos_quantity  (SIH — stock in hand)
"""

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import openpyxl
import xlrd


# ---------------------------------------------------------------------------
# Column indices
# ---------------------------------------------------------------------------
COL_ITEM_CODE = 0
COL_ITEM_NAME = 2
COL_COST = 6
COL_SELLING = 7
COL_SIH = 8

ITEM_CODE_PATTERN = re.compile(r"^[A-Z]{2,}[\d]+$")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class ParsedRow:
    item_code: str
    item_name: str
    cost_price: Optional[float]
    selling_price: Optional[float]
    pos_quantity: float
    category: str = ""


@dataclass
class ParseResult:
    rows: list = field(default_factory=list)
    snapshot_date: Optional[date] = None
    outlet_name: Optional[str] = None
    errors: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _to_float(val) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _is_item_code(val: str) -> bool:
    return bool(val and ITEM_CODE_PATTERN.match(str(val).strip()))


def _normalise_cell(val) -> str:
    """Return cell value as a stripped string."""
    if val is None:
        return ""
    return str(val).strip()


# ---------------------------------------------------------------------------
# Row-type classification
# ---------------------------------------------------------------------------
def classify_row(cells: list) -> str:
    """Return one of: 'data', 'category', 'total', 'blank'."""
    col0 = _normalise_cell(cells[0] if len(cells) > 0 else "")
    col4 = _normalise_cell(cells[4] if len(cells) > 4 else "")
    col8 = cells[8] if len(cells) > 8 else None

    if not any(_normalise_cell(c) for c in cells):
        return "blank"

    if col4.startswith("TOTAL FOR"):
        return "total"

    if _is_item_code(col0) and col8 is not None and col8 != "":
        try:
            float(col8)
            return "data"
        except (TypeError, ValueError):
            pass

    if col0 and col0 == col0.upper() and not _is_item_code(col0):
        return "category"

    return "blank"


# ---------------------------------------------------------------------------
# File readers — normalise to list-of-lists regardless of format
# ---------------------------------------------------------------------------
def _read_xlsx(file) -> list:
    wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(list(row))
    wb.close()
    return rows


def _read_xls(file) -> list:
    data = file.read() if hasattr(file, "read") else open(file, "rb").read()
    wb = xlrd.open_workbook(file_contents=data)
    ws = wb.sheet_by_index(0)
    rows = []
    for r in range(ws.nrows):
        row = []
        for c in range(ws.ncols):
            cell = ws.cell(r, c)
            if cell.ctype == xlrd.XL_CELL_EMPTY:
                row.append(None)
            elif cell.ctype == xlrd.XL_CELL_NUMBER:
                row.append(cell.value)
            elif cell.ctype == xlrd.XL_CELL_DATE:
                row.append(xlrd.xldate_as_datetime(cell.value, wb.datemode).date())
            else:
                row.append(str(cell.value).strip())
        rows.append(row)
    return rows


def _get_all_rows(file, filename: str) -> list:
    name = filename.lower()
    if name.endswith(".xlsx"):
        return _read_xlsx(file)
    elif name.endswith(".xls"):
        if hasattr(file, "seek"):
            file.seek(0)
        return _read_xls(file)
    raise ValueError("Unsupported file format. Only .xls and .xlsx are accepted.")


# ---------------------------------------------------------------------------
# Header extraction
# ---------------------------------------------------------------------------
def _extract_headers(rows: list) -> tuple:
    """
    Scan first 20 rows for:
      "Date As At"   → snapshot_date
      "SUPER MARKET:" → outlet_name
    Returns (snapshot_date: date | None, outlet_name: str | None)
    """
    snapshot_date = None
    outlet_name = None

    for row in rows[:20]:
        for i, cell in enumerate(row):
            text = _normalise_cell(cell)
            if "Date As At" in text or "DATE AS AT" in text:
                # Date is typically next cell
                if i + 1 < len(row):
                    d = row[i + 1]
                    if isinstance(d, date):
                        snapshot_date = d
                    else:
                        try:
                            from datetime import datetime
                            snapshot_date = datetime.strptime(
                                _normalise_cell(d), "%d/%m/%Y"
                            ).date()
                        except (ValueError, TypeError):
                            pass
            if "SUPER MARKET:" in text:
                # Value follows colon in same cell or next cell
                if ":" in text:
                    parts = text.split(":", 1)
                    outlet_name = parts[1].strip() if len(parts) > 1 else None
                elif i + 1 < len(row):
                    outlet_name = _normalise_cell(row[i + 1])

    return snapshot_date, outlet_name


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def parse_xls(file, filename: str) -> ParseResult:
    """
    Parse a POS stock balance XLS/XLSX file.
    Returns a ParseResult with rows of ParsedRow and metadata.
    Does NOT touch the database.
    """
    result = ParseResult()

    try:
        all_rows = _get_all_rows(file, filename)
    except ValueError as e:
        result.errors.append(str(e))
        return result

    result.snapshot_date, result.outlet_name = _extract_headers(all_rows)

    current_category = ""
    for raw_row in all_rows:
        # Pad row to at least 11 columns
        row = list(raw_row) + [None] * max(0, 11 - len(raw_row))
        kind = classify_row(row)

        if kind == "category":
            current_category = _normalise_cell(row[COL_ITEM_CODE])
        elif kind == "data":
            item_code = _normalise_cell(row[COL_ITEM_CODE])
            item_name = _normalise_cell(row[COL_ITEM_NAME])
            pos_qty = _to_float(row[COL_SIH])
            if pos_qty is None:
                continue
            result.rows.append(
                ParsedRow(
                    item_code=item_code,
                    item_name=item_name,
                    cost_price=_to_float(row[COL_COST]),
                    selling_price=_to_float(row[COL_SELLING]),
                    pos_quantity=pos_qty,
                    category=current_category,
                )
            )

    return result


def validate_file(file, filename: str, expected_outlet_name: str) -> dict:
    """
    Run pre-import validation checks.
    Returns {"valid": bool, "errors": [...], "warnings": [...], "preview": {...}}

    Note: date is read from the file itself — no "must match today" check.
    The caller decides whether the date requires admin approval.
    """
    errors = []
    warnings = []

    result = parse_xls(file, filename)

    if result.errors:
        errors.extend(result.errors)
        return {"valid": False, "errors": errors, "warnings": warnings, "preview": {}}

    # Date must be present in file
    if result.snapshot_date is None:
        errors.append("Could not find 'Date As At' header in file.")

    # Outlet match (case-insensitive, partial)
    if result.outlet_name is None:
        errors.append("Could not find 'SUPER MARKET:' header in file.")
    else:
        file_outlet = result.outlet_name.upper().replace(" ", "")
        expected = expected_outlet_name.upper().replace(" ", "")
        # Strip common prefix if present in expected
        for prefix in ("SUPERMARKET:", "SUPER MARKET:"):
            expected = expected.replace(prefix, "")
        if expected not in file_outlet and file_outlet not in expected:
            errors.append(
                f"File outlet '{result.outlet_name}' does not match your outlet '{expected_outlet_name}'."
            )

    if not result.rows:
        errors.append("No valid data rows found in the file.")

    preview = {
        "total_rows": len(result.rows),
        "snapshot_date": str(result.snapshot_date) if result.snapshot_date else None,
        "outlet_name": result.outlet_name,
    }

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "preview": preview,
        "_parsed": result,  # internal — stripped before returning to client
    }
