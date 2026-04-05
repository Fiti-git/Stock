from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsManager, IsStoreUser
from apps.uploads.models import AuditLog
from .models import Item, PendingItem
from .serializers import ItemSerializer, PendingItemSerializer, AssignBarcodeSerializer, ItemDetailSerializer


class ItemListView(generics.ListAPIView):
    serializer_class = ItemSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = Item.objects.select_related("outlet")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        outlet_filter = self.request.query_params.get("outlet")
        if outlet_filter:
            qs = qs.filter(outlet_id=outlet_filter)
        return qs


class ItemDetailView(generics.RetrieveAPIView):
    serializer_class = ItemDetailSerializer
    permission_classes = [IsStoreUser]

    def get_queryset(self):
        user = self.request.user
        qs = Item.objects.select_related("outlet")
        if user.role != "admin":
            qs = qs.filter(outlet=user.outlet)
        return qs


class PendingItemListView(generics.ListAPIView):
    serializer_class = PendingItemSerializer
    permission_classes = [IsManager]

    def get_queryset(self):
        user = self.request.user
        qs = PendingItem.objects.filter(status=PendingItem.Status.PENDING)
        if user.role != "admin":
            qs = qs.filter(first_seen_outlet=user.outlet)
        return qs


@api_view(["POST"])
@permission_classes([IsManager])
def assign_barcode(request, pending_id):
    """Assign a barcode to a NEW_CODE pending item."""
    try:
        pending = PendingItem.objects.select_related("first_seen_outlet").get(
            pk=pending_id,
            status=PendingItem.Status.PENDING,
            change_type=PendingItem.ChangeType.NEW_CODE,
        )
    except PendingItem.DoesNotExist:
        return Response({"detail": "Pending item not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = AssignBarcodeSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    barcode = serializer.validated_data["barcode"]
    category = serializer.validated_data.get("category", "")

    # Check barcode not already in use across all outlets
    if Item.objects.filter(barcode=barcode).exists():
        return Response(
            {"detail": "This barcode is already assigned to another item."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    outlet = pending.first_seen_outlet

    # Get or create the Item for this outlet
    item, _ = Item.objects.get_or_create(
        outlet=outlet,
        item_code=pending.item_code,
        defaults={"item_name": pending.item_name, "category": category},
    )
    item.barcode = barcode
    item.category = category or item.category
    item.status = Item.Status.ACTIVE
    item.barcode_assigned_at = timezone.now()
    item.barcode_assigned_by = request.user
    item.save()

    pending.status = PendingItem.Status.ASSIGNED
    pending.save()

    AuditLog.objects.create(
        user=request.user,
        action="assign_barcode",
        entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "barcode": barcode, "outlet": outlet.outlet_name},
    )

    return Response(ItemSerializer(item).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsManager])
def accept_change(request, pending_id):
    """Accept a DATA_CHANGED pending item — updates the item master with new values."""
    try:
        pending = PendingItem.objects.select_related("item", "first_seen_outlet").get(
            pk=pending_id,
            status=PendingItem.Status.PENDING,
            change_type=PendingItem.ChangeType.DATA_CHANGED,
        )
    except PendingItem.DoesNotExist:
        return Response({"detail": "Pending change not found."}, status=status.HTTP_404_NOT_FOUND)

    if not pending.item:
        return Response({"detail": "No linked item found."}, status=status.HTTP_400_BAD_REQUEST)

    item = pending.item
    changed = pending.changed_fields

    if "item_name" in changed:
        item.item_name = changed["item_name"]["new"]
    if "category" in changed:
        item.category = changed["category"]["new"]
    item.save()

    pending.status = PendingItem.Status.ASSIGNED
    pending.save()

    AuditLog.objects.create(
        user=request.user,
        action="accept_item_change",
        entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "changes_applied": changed},
    )

    return Response(ItemSerializer(item).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsManager])
def reject_change(request, pending_id):
    """Reject a DATA_CHANGED pending item — keeps the existing item master unchanged."""
    try:
        pending = PendingItem.objects.get(
            pk=pending_id,
            status=PendingItem.Status.PENDING,
            change_type=PendingItem.ChangeType.DATA_CHANGED,
        )
    except PendingItem.DoesNotExist:
        return Response({"detail": "Pending change not found."}, status=status.HTTP_404_NOT_FOUND)

    pending.status = PendingItem.Status.REJECTED
    pending.save()

    AuditLog.objects.create(
        user=request.user,
        action="reject_item_change",
        entity_type="pending_item",
        entity_id=str(pending.id),
        details={"item_code": pending.item_code, "rejected_changes": pending.changed_fields},
    )

    return Response({"detail": "Change rejected. Item master unchanged."})
