"""
Inter-outlet stock transfer endpoints.

State-machine driven: each action endpoint verifies the user's role
against the transfer's outlets, applies the transition through
inventory_ops (which records a TransferEvent), and emits an AuditLog row.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as drf_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.items.models import Item
from apps.uploads.models import AuditLog

from . import inventory_ops, permissions as tperms
from .models import StockTransfer, StockTransferLine
from .serializers import (
    StockTransferDetailSerializer,
    StockTransferListSerializer,
)
from .state_machine import S


def _audit(user, action, transfer, details=None):
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        entity_type="StockTransfer",
        entity_id=str(getattr(transfer, "pk", "") or ""),
        details=details or {},
    )


def _next_ref_no():
    """TR-YYYYMMDD-NNNN — NNNN is the count of same-day rows + 1."""
    today = timezone.localdate()
    prefix = f"TR-{today.strftime('%Y%m%d')}-"
    same_day = StockTransfer.objects.filter(ref_no__startswith=prefix).count()
    return f"{prefix}{same_day + 1:04d}"


def _err(msg, code=400):
    return Response({"detail": msg}, status=code)


# -------------------------------------------------------------------
# List + create
# -------------------------------------------------------------------

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def transfers_collection(request):
    if request.method == "GET":
        qs = StockTransfer.objects.all().select_related("source_outlet", "dest_outlet")
        # Visibility scoping for non-admins.
        u = request.user
        if u.role not in ("admin", "super_admin"):
            qs = qs.filter(Q(source_outlet_id=u.outlet_id) | Q(dest_outlet_id=u.outlet_id))

        status_q = request.query_params.get("status")
        if status_q:
            qs = qs.filter(status=status_q)
        outlet_q = request.query_params.get("outlet")
        if outlet_q:
            qs = qs.filter(Q(source_outlet_id=outlet_q) | Q(dest_outlet_id=outlet_q))
        src = request.query_params.get("source_outlet")
        if src:
            qs = qs.filter(source_outlet_id=src)
        dst = request.query_params.get("dest_outlet")
        if dst:
            qs = qs.filter(dest_outlet_id=dst)
        date_from = request.query_params.get("date_from")
        if date_from:
            try:
                qs = qs.filter(created_at__date__gte=datetime.fromisoformat(date_from).date())
            except ValueError:
                pass
        date_to = request.query_params.get("date_to")
        if date_to:
            try:
                qs = qs.filter(created_at__date__lte=datetime.fromisoformat(date_to).date())
            except ValueError:
                pass

        qs = qs[: int(request.query_params.get("limit") or 200)]
        return Response(StockTransferListSerializer(qs, many=True).data)

    # POST — create DRAFT with optional lines
    data = request.data or {}
    src = data.get("source_outlet")
    dst = data.get("dest_outlet")
    if not src or not dst:
        return _err("source_outlet and dest_outlet are required")
    if int(src) == int(dst):
        return _err("source_outlet and dest_outlet must differ")

    lines_in = data.get("lines") or []
    if not isinstance(lines_in, list):
        return _err("`lines` must be a list")

    with transaction.atomic():
        transfer = StockTransfer.objects.create(
            ref_no=_next_ref_no(),
            source_outlet_id=src,
            dest_outlet_id=dst,
            status=S.DRAFT,
            note=(data.get("note") or "")[:500],
            created_by=request.user,
        )
        for li in lines_in:
            try:
                item = Item.objects.get(pk=li["item"])
            except (Item.DoesNotExist, KeyError):
                continue
            try:
                qty = Decimal(str(li.get("qty_requested") or 0))
            except (InvalidOperation, TypeError):
                qty = Decimal("0")
            StockTransferLine.objects.create(
                transfer=transfer,
                item=item,
                item_code=item.item_code,
                item_name=item.item_name,
                qty_requested=qty,
                unit_cost=item.cost_price or Decimal("0"),
                note=(li.get("note") or "")[:200],
            )
        # Initial event so the timeline starts at draft.
        from .models import TransferEvent
        TransferEvent.objects.create(
            transfer=transfer,
            from_status="",
            to_status=S.DRAFT,
            actor=request.user,
            note="Created",
        )
        _audit(request.user, "transfer.create", transfer, {
            "ref_no": transfer.ref_no,
            "source_outlet": src,
            "dest_outlet": dst,
            "lines": len(lines_in),
        })

    return Response(
        StockTransferDetailSerializer(transfer).data,
        status=drf_status.HTTP_201_CREATED,
    )


# -------------------------------------------------------------------
# Detail + edit-draft
# -------------------------------------------------------------------

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def transfer_detail(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_view(request.user, transfer):
        return _err("Forbidden", code=403)

    if request.method == "GET":
        return Response(StockTransferDetailSerializer(transfer).data)

    # PATCH — only while DRAFT.
    if transfer.status != S.DRAFT:
        return _err("Only DRAFT transfers can be edited.", code=409)
    if not tperms.can_create_or_edit_draft(request.user, transfer):
        return _err("Forbidden", code=403)

    data = request.data or {}
    with transaction.atomic():
        if "note" in data:
            transfer.note = (data.get("note") or "")[:500]
            transfer.save(update_fields=["note", "updated_at"])
        if "lines" in data:
            # Replace-all semantics: simplest correct behaviour for DRAFT edits.
            transfer.lines.all().delete()
            for li in (data.get("lines") or []):
                try:
                    item = Item.objects.get(pk=li["item"])
                except (Item.DoesNotExist, KeyError):
                    continue
                try:
                    qty = Decimal(str(li.get("qty_requested") or 0))
                except (InvalidOperation, TypeError):
                    qty = Decimal("0")
                StockTransferLine.objects.create(
                    transfer=transfer,
                    item=item,
                    item_code=item.item_code,
                    item_name=item.item_name,
                    qty_requested=qty,
                    unit_cost=item.cost_price or Decimal("0"),
                    note=(li.get("note") or "")[:200],
                )
        _audit(request.user, "transfer.edit_draft", transfer, {})
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)


# -------------------------------------------------------------------
# Transitions
# -------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_request(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_request(request.user, transfer):
        return _err("Forbidden", code=403)
    try:
        inventory_ops.request_transfer(transfer, request.user,
                                       note=request.data.get("note") or "")
    except ValueError as e:
        return _err(str(e), code=409)
    _audit(request.user, "transfer.request", transfer, {})
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_dispatch(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_dispatch(request.user, transfer):
        return _err("Only the source-outlet manager can dispatch.", code=403)
    overrides = request.data.get("lines") or []
    try:
        inventory_ops.dispatch_transfer(
            transfer, request.user,
            line_overrides=overrides,
            note=request.data.get("note") or "",
        )
    except ValueError as e:
        return _err(str(e), code=409)
    _audit(request.user, "transfer.dispatch", transfer, {
        "overrides": len(overrides),
    })
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_receive(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_receive(request.user, transfer):
        return _err("Only the destination-outlet manager can receive.", code=403)
    rows = request.data.get("lines") or []
    if not isinstance(rows, list):
        return _err("`lines` must be a list")
    try:
        inventory_ops.receive_transfer(
            transfer, rows, request.user,
            note=request.data.get("note") or "",
        )
    except ValueError as e:
        return _err(str(e), code=409)
    _audit(request.user, "transfer.receive", transfer, {"lines": len(rows)})
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_close(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_close(request.user, transfer):
        return _err("Forbidden", code=403)
    try:
        inventory_ops.close_transfer(
            transfer, request.user,
            variance_note=request.data.get("variance_note") or "",
        )
    except ValueError as e:
        return _err(str(e), code=409)
    _audit(request.user, "transfer.close", transfer, {})
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transfer_cancel(request, pk):
    transfer = get_object_or_404(StockTransfer, pk=pk)
    if not tperms.can_cancel(request.user, transfer):
        return _err("Forbidden", code=403)
    reason = (request.data.get("reason") or "").strip()
    try:
        inventory_ops.cancel_transfer(transfer, request.user, reason=reason)
    except ValueError as e:
        return _err(str(e), code=409)
    _audit(request.user, "transfer.cancel", transfer, {"reason": reason})
    transfer.refresh_from_db()
    return Response(StockTransferDetailSerializer(transfer).data)
