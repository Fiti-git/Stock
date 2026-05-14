"""
Writes a UploadedSheet snapshot of every XLS confirm-call so the unified
Uploaded-Sheets page can render the exact rows the manager uploaded.

We derive rows from the parsed dataclass output (every column the parser
captured) — no need to re-read the file.
"""

from dataclasses import asdict, is_dataclass
from datetime import date as _date, datetime, time as _time
from decimal import Decimal
from typing import Iterable, Optional

from .models import UploadedSheet


def _json_safe(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (_date, datetime, _time)):
        return v.isoformat()
    return str(v)


def _row_to_dict(row) -> dict:
    if isinstance(row, dict):
        d = row
    elif is_dataclass(row):
        d = asdict(row)
    else:
        d = {k: getattr(row, k) for k in dir(row) if not k.startswith("_") and not callable(getattr(row, k))}
    return {k: _json_safe(v) for k, v in d.items()}


def record_uploaded_sheet(
    *,
    pipeline: str,
    batch_id: int,
    outlet,
    business_date: _date,
    business_date_to: Optional[_date],
    uploaded_by,
    filename: str,
    rows: Iterable,
    approval_status: str,
    approval_reason: str = "",
) -> UploadedSheet:
    raw_rows = [_row_to_dict(r) for r in rows]
    columns = list(raw_rows[0].keys()) if raw_rows else []
    return UploadedSheet.objects.create(
        pipeline=pipeline,
        batch_id=batch_id,
        outlet=outlet,
        business_date=business_date,
        business_date_to=business_date_to,
        uploaded_by=uploaded_by,
        filename=(filename or "")[:255],
        row_count=len(raw_rows),
        approval_status=approval_status,
        approval_reason=approval_reason,
        columns=columns,
        rows=raw_rows,
    )
