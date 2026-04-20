"""Return-to-Supplier (RTS) upload pipeline — thin wrapper around shared 19-col helpers."""

from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser

from apps.accounts.permissions import IsStoreUser, IsAdmin, IsManager

from .models import RtsUploadBatch, RtsLine
from .views_txn19 import (
    TypeConfig,
    handle_validate, handle_confirm, handle_list, handle_detail,
    handle_approve, handle_reject, handle_delete, handle_deletion_preview,
    handle_overview, handle_stats,
)


CFG = TypeConfig(type_code="rts", label="Return to Supplier", batch_model=RtsUploadBatch, line_model=RtsLine)


@api_view(["POST"])
@permission_classes([IsStoreUser])
@parser_classes([MultiPartParser])
def rts_validate(request):
    return handle_validate(request, CFG)


@api_view(["POST"])
@permission_classes([IsStoreUser])
@parser_classes([MultiPartParser])
def rts_confirm(request):
    return handle_confirm(request, CFG)


@api_view(["GET"])
@permission_classes([IsStoreUser])
def rts_batches(request):
    return handle_list(request, CFG)


@api_view(["GET"])
@permission_classes([IsStoreUser])
def rts_batch_detail(request, batch_id: int):
    return handle_detail(request, CFG, batch_id)


@api_view(["POST"])
@permission_classes([IsAdmin])
def rts_approve(request, batch_id: int):
    return handle_approve(request, CFG, batch_id)


@api_view(["POST"])
@permission_classes([IsAdmin])
def rts_reject(request, batch_id: int):
    return handle_reject(request, CFG, batch_id)


@api_view(["GET"])
@permission_classes([IsStoreUser])
def rts_deletion_preview(request, batch_id: int):
    return handle_deletion_preview(request, CFG, batch_id)


@api_view(["DELETE"])
@permission_classes([IsStoreUser])
def rts_delete(request, batch_id: int):
    return handle_delete(request, CFG, batch_id)


@api_view(["GET"])
@permission_classes([IsManager])
def rts_overview(request):
    return handle_overview(request, CFG)


@api_view(["GET"])
@permission_classes([IsStoreUser])
def rts_stats(request):
    return handle_stats(request, CFG)
