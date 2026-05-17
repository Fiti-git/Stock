"""
Writes a UploadedSheet metadata record on every XLS confirm-call so the unified
Uploaded-Sheets page can list and inspect uploads across all pipelines.

Row data is no longer stored here — the detail endpoint queries the pipeline's
own line table (pipeline_registry.py) instead. This eliminates the ~500KB-per-
upload JSON blob that was causing DB bloat.
"""

from datetime import date as _date
from typing import Optional

from .models import UploadedSheet


def record_uploaded_sheet(
    *,
    pipeline: str,
    batch_id: int,
    outlet,
    business_date: _date,
    business_date_to: Optional[_date],
    uploaded_by,
    filename: str,
    row_count: int,
    columns: list,
    approval_status: str,
    approval_reason: str = "",
) -> UploadedSheet:
    return UploadedSheet.objects.create(
        pipeline=pipeline,
        batch_id=batch_id,
        outlet=outlet,
        business_date=business_date,
        business_date_to=business_date_to,
        uploaded_by=uploaded_by,
        filename=(filename or "")[:255],
        row_count=row_count,
        approval_status=approval_status,
        approval_reason=approval_reason,
        columns=columns,
        # rows intentionally not set — DB field stays for legacy records
    )
