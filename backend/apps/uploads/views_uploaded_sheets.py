"""
Unified Uploaded-Sheets endpoints.

Manager and Admin can list every XLS upload across all 8 pipelines and
drill into any row to see the exact table that was uploaded.

Detail endpoint uses a two-tier strategy:
  1. If UploadedSheet.rows is still populated (legacy records) — return it.
  2. Otherwise — query the pipeline's line table dynamically (pipeline_registry).
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import IsManager

from .models import UploadedSheet
from .pipeline_registry import get_pipeline_config


MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25
DETAIL_PAGE_SIZE = 100


def _scope_qs(request):
    user = request.user
    qs = UploadedSheet.objects.select_related("outlet", "uploaded_by")
    if user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet=user.outlet)
    return qs


def _summary(s: UploadedSheet) -> dict:
    return {
        "id": s.id,
        "pipeline": s.pipeline,
        "pipeline_label": s.get_pipeline_display(),
        "batch_id": s.batch_id,
        "outlet_id": s.outlet_id,
        "outlet_name": s.outlet.outlet_name if s.outlet_id else None,
        "business_date": str(s.business_date),
        "business_date_to": str(s.business_date_to) if s.business_date_to else None,
        "uploaded_by": s.uploaded_by.username if s.uploaded_by_id else None,
        "uploaded_at": s.uploaded_at.isoformat(),
        "filename": s.filename,
        "row_count": s.row_count,
        "approval_status": s.approval_status,
        "approval_reason": s.approval_reason,
    }


@api_view(["GET"])
@permission_classes([IsManager])
def uploaded_sheets_list(request):
    """
    GET /api/uploads/all-uploads/
    Query params:
      pipeline             — pos|damage|office|verification|grn|rts|sales|sales_returns
      outlet_id            — admin-only filter
      approval_status      — auto|pending|approved|rejected
      from_date / to_date  — business_date filter (YYYY-MM-DD)
      page, page_size
    """
    qs = _scope_qs(request).order_by("-uploaded_at")

    pipeline = request.query_params.get("pipeline")
    if pipeline:
        qs = qs.filter(pipeline=pipeline)

    outlet_id = request.query_params.get("outlet_id")
    if outlet_id and request.user.role in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        qs = qs.filter(outlet_id=outlet_id)

    approval = request.query_params.get("approval_status")
    if approval:
        qs = qs.filter(approval_status=approval)

    from_date = request.query_params.get("from_date")
    to_date = request.query_params.get("to_date")
    if from_date:
        qs = qs.filter(business_date__gte=from_date)
    if to_date:
        qs = qs.filter(business_date__lte=to_date)

    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or DEFAULT_PAGE_SIZE)
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(MAX_PAGE_SIZE, page_size))

    total = qs.count()
    offset = (page - 1) * page_size
    sheets = list(qs[offset: offset + page_size])

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": [_summary(s) for s in sheets],
    })


@api_view(["GET"])
@permission_classes([IsManager])
def uploaded_sheet_detail(request, sheet_id: int):
    """
    GET /api/uploads/all-uploads/<sheet_id>/?page=1&page_size=100

    Returns paginated rows for the sheet. Two-tier strategy:
      - Legacy records with rows stored in JSONField → returned as-is (sliced)
      - New records (rows=[]) → data queried live from the pipeline's line table
    """
    sheet = get_object_or_404(
        UploadedSheet.objects.select_related("outlet", "uploaded_by"),
        pk=sheet_id,
    )
    if request.user.role not in (User.Role.ADMIN, User.Role.SUPER_ADMIN):
        if sheet.outlet_id != request.user.outlet_id:
            return Response({"detail": "Not permitted."}, status=status.HTTP_403_FORBIDDEN)

    try:
        page = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size") or DETAIL_PAGE_SIZE)
    except (TypeError, ValueError):
        page_size = DETAIL_PAGE_SIZE
    page_size = max(1, min(500, page_size))

    summary = _summary(sheet)

    # --- Legacy path: rows still stored in JSON ---
    if sheet.rows:
        all_rows = sheet.rows
        total = len(all_rows)
        offset = (page - 1) * page_size
        page_rows = all_rows[offset: offset + page_size]
        summary["columns"] = sheet.columns or (list(page_rows[0].keys()) if page_rows else [])
        summary["rows"] = page_rows
        summary["count"] = total
        summary["page"] = page
        summary["page_size"] = page_size
        summary["total_pages"] = max(1, (total + page_size - 1) // page_size)
        return Response(summary)

    # --- New path: query line table ---
    cfg = get_pipeline_config(sheet.pipeline)
    if cfg is None:
        summary["columns"] = sheet.columns or []
        summary["rows"] = []
        summary["count"] = 0
        summary["page"] = 1
        summary["page_size"] = page_size
        summary["total_pages"] = 1
        return Response(summary)

    model = cfg["model"]
    batch_fk = cfg["batch_fk"]
    row_fn = cfg["row_fn"]
    select_rel = cfg["select_rel"]

    qs = model.objects.filter(**{batch_fk: sheet.batch_id})
    if select_rel:
        qs = qs.select_related(*select_rel)

    total = qs.count()
    offset = (page - 1) * page_size
    objs = list(qs[offset: offset + page_size])
    rows = [row_fn(o) for o in objs]

    columns = sheet.columns if sheet.columns else cfg["columns"]

    summary["columns"] = columns
    summary["rows"] = rows
    summary["count"] = total
    summary["page"] = page
    summary["page_size"] = page_size
    summary["total_pages"] = max(1, (total + page_size - 1) // page_size)
    return Response(summary)
