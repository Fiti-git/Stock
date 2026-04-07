from django.db.models import OuterRef, Subquery, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsManager, IsStoreUser
from apps.uploads.models import AuditLog, PosSnapshot
from .models import Item, PendingItem
from .serializers import ItemSerializer, PendingItemSerializer, AssignBarcodeSerializer, ItemDetailSerializer


class ItemListPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class ItemListView(generics.ListAPIView):
    serializer_class = ItemSerializer
    permission_classes = [IsAdmin]
    pagination_class = ItemListPagination

    def get_queryset(self):
        qs = Item.objects.select_related("outlet").order_by("outlet__outlet_name", "item_code")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        outlet_filter = self.request.query_params.get("outlet")
        if outlet_filter:
            qs = qs.filter(outlet_id=outlet_filter)
        q = self.request.query_params.get("q")
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q))
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


# ---------------------------------------------------------------------------
# Product Catalog (manager + admin)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsManager])
def catalog_list(request):
    """
    Paginated product catalog with latest price data from POS snapshots.
    Managers see their own outlet; admins may pass ?outlet=<id>.
    Supports ?q= (search) and ?category= (filter).
    """
    user = request.user

    if user.role == "admin":
        outlet_id = request.query_params.get("outlet")
        if outlet_id:
            qs = Item.objects.filter(outlet_id=outlet_id)
        else:
            qs = Item.objects.all()
    else:
        qs = Item.objects.filter(outlet=user.outlet)

    q = request.query_params.get("q", "").strip()
    if q:
        qs = qs.filter(
            Q(item_name__icontains=q) | Q(item_code__icontains=q) | Q(barcode__icontains=q)
        )

    category = request.query_params.get("category", "").strip()
    if category:
        qs = qs.filter(category=category)

    # Annotate with latest snapshot prices via subquery (single SQL query, no N+1)
    latest_snap = PosSnapshot.objects.filter(item=OuterRef("pk")).order_by("-snapshot_date")
    qs = qs.select_related("outlet").annotate(
        latest_selling_price=Subquery(latest_snap.values("selling_price")[:1]),
        latest_cost_price=Subquery(latest_snap.values("cost_price")[:1]),
        latest_snapshot_date=Subquery(latest_snap.values("snapshot_date")[:1]),
    ).order_by("item_name")

    # Manual pagination (page_size=50)
    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    page_size = 50
    offset = (page - 1) * page_size
    total = qs.count()
    items = qs[offset: offset + page_size]

    results = []
    for item in items:
        results.append({
            "id": item.id,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "barcode": item.barcode,
            "category": item.category,
            "status": item.status,
            "outlet_name": item.outlet.outlet_name,
            "latest_selling_price": str(item.latest_selling_price) if item.latest_selling_price is not None else None,
            "latest_cost_price": str(item.latest_cost_price) if item.latest_cost_price is not None else None,
            "latest_snapshot_date": str(item.latest_snapshot_date) if item.latest_snapshot_date else None,
        })

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def item_price_history(request, item_id):
    """
    Returns last 90 POS snapshots for a product (price + qty over time).
    Non-admin users are restricted to their own outlet's items.
    """
    user = request.user
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if user.role != "admin" and item.outlet != user.outlet:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    snapshots = PosSnapshot.objects.filter(item=item).order_by("snapshot_date")[:90]
    history = [
        {
            "snapshot_date": str(s.snapshot_date),
            "selling_price": str(s.selling_price) if s.selling_price is not None else None,
            "cost_price": str(s.cost_price) if s.cost_price is not None else None,
            "pos_quantity": str(s.pos_quantity),
        }
        for s in snapshots
    ]

    return Response({
        "item_id": item.id,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "history": history,
    })
