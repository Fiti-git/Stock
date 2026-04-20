"""
Operations 'Today' dashboard — single endpoint that returns per-outlet upload
status across every report type (POS snapshot + Damage + Office +
Verification + GRN + RTS + Sales + Sales Returns) for a given date.

Super-admin only for now. The spec is: for each active outlet × type, tell
the admin whether a SUCCESS batch covers the target date, whether a batch
is pending approval, and what the rollup looks like for that date.

Query structure favors few aggregate queries over one-query-per-outlet —
the response is O(outlets + types) DB hits no matter how many rows sit in
the detail tables.
"""

from collections import defaultdict
from datetime import date

from django.db.models import Sum, Count, Q
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.outlets.models import Outlet

from .models import (
    UploadLog, PosSnapshot,
    DamageUploadBatch, OfficeUploadBatch, VerificationUploadBatch,
    GrnUploadBatch, RtsUploadBatch, SalesUploadBatch,
    SalesReturnUploadBatch, SalesLine,
)


# Transaction types use a date-range batch model; map code → model.
RANGE_TYPES = [
    ("damage",        DamageUploadBatch),
    ("office",        OfficeUploadBatch),
    ("verification",  VerificationUploadBatch),
    ("grn",           GrnUploadBatch),
    ("rts",           RtsUploadBatch),
    ("sales",         SalesUploadBatch),
    ("sales_returns", SalesReturnUploadBatch),
]

TYPE_LABELS = {
    "pos_snapshot":  "POS Snapshot",
    "damage":        "Damage",
    "office":        "Office Use",
    "verification":  "Verification",
    "grn":           "GRN",
    "rts":           "Return to Supplier",
    "sales":         "Sales",
    "sales_returns": "Sales Returns",
}


def _cell(status: str, batch_id=None, rows=None, amount=None):
    return {
        "status": status,  # "success" | "pending" | "missing"
        "batch_id": batch_id,
        "rows": rows,
        "amount": None if amount is None else float(amount),
    }


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def operations_today(request):
    """
    GET /api/uploads/operations/today/?date=YYYY-MM-DD

    Returns:
      {
        "date": "2026-04-20",
        "outlets": [ { id, name, short_code, types: {...}, pending, last_activity } ],
        "totals": {
          "outlets": N,
          "today_sales_lkr": ...,
          "pending_approvals": ...,
          "type_coverage": { type_code: {"covered": X, "missing": Y, "pending": Z} }
        }
      }
    """
    raw = request.query_params.get("date") or str(date.today())
    try:
        target = date.fromisoformat(raw)
    except ValueError:
        return Response({"detail": "Invalid date. Use YYYY-MM-DD."}, status=http_status.HTTP_400_BAD_REQUEST)

    outlets = list(Outlet.objects.all().order_by("outlet_name"))
    outlet_map = {o.id: o for o in outlets}
    # Nested dict: outlet_id → type_code → cell
    matrix = defaultdict(dict)

    # --- POS snapshot (single-date model) ---
    pos_qs = (
        UploadLog.objects
        .filter(snapshot_date=target)
        .values("outlet_id", "id", "status", "approval_status", "total_rows")
    )
    for row in pos_qs:
        if row["status"] == UploadLog.Status.SUCCESS and row["approval_status"] != UploadLog.ApprovalStatus.REJECTED:
            cell = _cell("success", row["id"], row["total_rows"])
        elif row["approval_status"] == UploadLog.ApprovalStatus.PENDING:
            cell = _cell("pending", row["id"], row["total_rows"])
        else:
            continue
        matrix[row["outlet_id"]]["pos_snapshot"] = cell

    # --- Range types: batch.date_from <= target <= batch.date_to, status=SUCCESS ---
    for type_code, Model in RANGE_TYPES:
        # SUCCESS rows that cover the date. Pick the most-recently-uploaded one
        # per outlet (there should be only one live thanks to overlap-block).
        success_qs = (
            Model.objects
            .filter(
                status=Model.Status.SUCCESS,
                date_from__lte=target,
                date_to__gte=target,
            )
            .values("outlet_id", "id", "total_rows", "total_amount")
        )
        seen_outlets = set()
        for row in success_qs:
            if row["outlet_id"] in seen_outlets:
                continue
            seen_outlets.add(row["outlet_id"])
            matrix[row["outlet_id"]][type_code] = _cell(
                "success", row["id"], row["total_rows"], row["total_amount"]
            )

        # Pending approval rows for the same date range — only surface if no
        # SUCCESS row already covers the cell.
        pending_qs = (
            Model.objects
            .filter(
                approval_status=Model.ApprovalStatus.PENDING,
                date_from__lte=target,
                date_to__gte=target,
            )
            .values("outlet_id", "id", "total_rows", "total_amount")
        )
        for row in pending_qs:
            if type_code in matrix.get(row["outlet_id"], {}):
                continue
            matrix[row["outlet_id"]][type_code] = _cell(
                "pending", row["id"], row["total_rows"], row["total_amount"]
            )

    # --- Today's realised sales (from SalesLine, uses (outlet, txn_date) index) ---
    sales_by_outlet = {
        row["outlet_id"]: float(row["amt"] or 0)
        for row in SalesLine.objects
        .filter(txn_date=target)
        .values("outlet_id")
        .annotate(amt=Sum("amount"))
    }

    # --- Pending approvals count per outlet across all range types + POS ---
    pending_counts = defaultdict(int)
    pos_pending = (
        UploadLog.objects
        .filter(approval_status=UploadLog.ApprovalStatus.PENDING)
        .values("outlet_id")
        .annotate(n=Count("id"))
    )
    for row in pos_pending:
        pending_counts[row["outlet_id"]] += row["n"]
    for _, Model in RANGE_TYPES:
        for row in (
            Model.objects
            .filter(approval_status=Model.ApprovalStatus.PENDING)
            .values("outlet_id")
            .annotate(n=Count("id"))
        ):
            pending_counts[row["outlet_id"]] += row["n"]

    # --- Last activity per outlet (latest uploaded_at across all batch tables) ---
    last_activity = {}
    pos_last = (
        UploadLog.objects
        .filter(status=UploadLog.Status.SUCCESS)
        .values("outlet_id")
        .annotate(ts=Count("id"))  # placeholder; need max()
    )
    # Correct: we want max(uploaded_at) per outlet.
    from django.db.models import Max
    for src in [UploadLog] + [m for _, m in RANGE_TYPES]:
        for row in (
            src.objects
            .filter(status=src.Status.SUCCESS)
            .values("outlet_id")
            .annotate(ts=Max("uploaded_at"))
        ):
            existing = last_activity.get(row["outlet_id"])
            if not existing or row["ts"] > existing:
                last_activity[row["outlet_id"]] = row["ts"]

    # --- Assemble per-outlet rows ---
    all_types = ["pos_snapshot"] + [t for t, _ in RANGE_TYPES]
    outlet_rows = []
    for o in outlets:
        type_cells = {}
        for t in all_types:
            type_cells[t] = matrix.get(o.id, {}).get(t) or _cell("missing")
        outlet_rows.append({
            "outlet_id": o.id,
            "outlet_name": o.outlet_name,
            "short_code": o.short_code,
            "types": type_cells,
            "pending_approvals": pending_counts.get(o.id, 0),
            "today_sales_lkr": sales_by_outlet.get(o.id, 0),
            "last_activity_at": last_activity.get(o.id).isoformat() if last_activity.get(o.id) else None,
        })

    # --- Totals / type coverage ---
    type_coverage = {
        t: {"covered": 0, "missing": 0, "pending": 0, "label": TYPE_LABELS.get(t, t)}
        for t in all_types
    }
    for row in outlet_rows:
        for t in all_types:
            cell = row["types"][t]
            if cell["status"] == "success":
                type_coverage[t]["covered"] += 1
            elif cell["status"] == "pending":
                type_coverage[t]["pending"] += 1
            else:
                type_coverage[t]["missing"] += 1

    totals = {
        "outlets": len(outlets),
        "today_sales_lkr": float(sum(sales_by_outlet.values())),
        "pending_approvals": sum(pending_counts.values()),
        "type_coverage": type_coverage,
    }

    return Response({
        "date": str(target),
        "outlets": outlet_rows,
        "totals": totals,
        "type_order": all_types,
        "type_labels": TYPE_LABELS,
    })
