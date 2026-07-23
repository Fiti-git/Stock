from collections import defaultdict
from decimal import Decimal
from django.db.models import OuterRef, Subquery, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsManager, IsStoreUser
from apps.accounts.device_utils import touch_device, get_device_uuid
from apps.uploads.models import AuditLog, PosSnapshot
from .models import Item, ItemBarcode, PendingItem, UnitOfMeasure
from .serializers import ItemSerializer, PendingItemSerializer, AssignBarcodeSerializer, ItemDetailSerializer, ItemUpdateSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def units_list(request):
    """List all UnitOfMeasure rows — used by product create/edit forms."""
    rows = UnitOfMeasure.objects.all().order_by("code")
    return Response([
        {
            "id": u.id,
            "code": u.code,
            "name": u.name,
            "is_weighed": bool(u.is_weight),
            "precision": u.precision,
        }
        for u in rows
    ])


class ItemListPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class PendingItemPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class ItemListView(generics.ListAPIView):
    serializer_class = ItemSerializer
    permission_classes = [IsManager]
    pagination_class = ItemListPagination

    def get_queryset(self):
        user = self.request.user
        if user.role == "admin":
            qs = Item.objects.select_related("outlet").order_by("outlet__outlet_name", "item_code")
            outlet_filter = self.request.query_params.get("outlet")
            if outlet_filter:
                qs = qs.filter(outlet_id=outlet_filter)
        else:
            qs = Item.objects.select_related("outlet").filter(outlet=user.outlet).order_by("item_code")

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q))

        latest_snap = PosSnapshot.objects.filter(item=OuterRef("pk")).order_by("-snapshot_date")
        qs = qs.annotate(
            latest_cost_price=Subquery(latest_snap.values("cost_price")[:1]),
            latest_selling_price=Subquery(latest_snap.values("selling_price")[:1]),
        )
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
    pagination_class = PendingItemPagination

    def get_queryset(self):
        user = self.request.user
        qs = PendingItem.objects.filter(status=PendingItem.Status.PENDING).select_related("first_seen_outlet", "item")
        if user.role == "admin":
            outlet_filter = self.request.query_params.get("outlet")
            if outlet_filter:
                qs = qs.filter(first_seen_outlet_id=outlet_filter)
        else:
            qs = qs.filter(first_seen_outlet=user.outlet)
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(item_code__icontains=q) | Q(item_name__icontains=q))
        return qs.order_by("first_seen_date")


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
    rack_number = serializer.validated_data.get("rack_number", "")
    shelf = serializer.validated_data.get("shelf", "")

    outlet = pending.first_seen_outlet

    # Check barcode not already in use within this outlet
    if ItemBarcode.objects.filter(outlet=outlet, barcode=barcode).exists():
        return Response(
            {"detail": "This barcode is already assigned to another item in this outlet."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Managers can only assign barcodes for their own outlet
    if request.user.role != "admin" and outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    # Get or create the Item for this outlet
    item, _ = Item.objects.get_or_create(
        outlet=outlet,
        item_code=pending.item_code,
        defaults={"item_name": pending.item_name, "category": category},
    )
    item.category = category or item.category
    item.rack_number = rack_number or item.rack_number
    item.shelf = shelf or item.shelf
    item.status = Item.Status.ACTIVE
    item.barcode_assigned_at = timezone.now()
    item.barcode_assigned_by = request.user
    item.save()

    device_uuid = get_device_uuid(request)
    touch_device(request, action="assign")

    is_first = not item.barcodes.exists()
    ItemBarcode.objects.create(
        item=item,
        outlet=outlet,
        barcode=barcode,
        is_primary=is_first,
        assigned_by=request.user,
        device_uuid=device_uuid,
    )

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

    # Apply every tracked field that maps directly onto the Item model
    ITEM_FIELDS = {"item_name", "category"}
    for field_name, diff in changed.items():
        if field_name in ITEM_FIELDS:
            setattr(item, field_name, diff["new"])
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


@api_view(["GET", "POST"])
@permission_classes([IsManager])
def item_barcodes(request, item_id):
    """List or add barcodes for an item. Barcodes are unique per outlet."""
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and item.outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        data = [
            {"id": b.id, "barcode": b.barcode, "is_primary": b.is_primary, "assigned_at": b.assigned_at.isoformat()}
            for b in item.barcodes.all()
        ]
        return Response(data)

    barcode = (request.data.get("barcode") or "").strip()
    if not barcode:
        return Response({"detail": "barcode required."}, status=status.HTTP_400_BAD_REQUEST)

    if ItemBarcode.objects.filter(outlet=item.outlet, barcode=barcode).exists():
        return Response({"detail": "This barcode is already assigned in this outlet."}, status=status.HTTP_400_BAD_REQUEST)

    device_uuid = get_device_uuid(request)
    touch_device(request, action="assign")

    is_first = not item.barcodes.exists()
    ib = ItemBarcode.objects.create(
        item=item, outlet=item.outlet, barcode=barcode,
        is_primary=is_first, assigned_by=request.user,
        device_uuid=device_uuid,
    )
    if is_first:
        item.status = Item.Status.ACTIVE
        item.barcode_assigned_at = timezone.now()
        item.barcode_assigned_by = request.user
        item.save(update_fields=["status", "barcode_assigned_at", "barcode_assigned_by"])

    AuditLog.objects.create(
        user=request.user, action="add_barcode", entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "barcode": barcode},
    )
    return Response({"id": ib.id, "barcode": ib.barcode, "is_primary": ib.is_primary}, status=status.HTTP_201_CREATED)


@api_view(["DELETE", "POST"])
@permission_classes([IsManager])
def item_barcode_detail(request, item_id, barcode_id):
    """DELETE: remove a barcode. POST: set as primary (action=set_primary)."""
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
        ib = ItemBarcode.objects.get(pk=barcode_id, item=item)
    except (Item.DoesNotExist, ItemBarcode.DoesNotExist):
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and item.outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        was_primary = ib.is_primary
        barcode_val = ib.barcode
        ib.delete()
        if was_primary:
            new_primary = item.barcodes.order_by("assigned_at").first()
            if new_primary:
                new_primary.is_primary = True
                new_primary.save(update_fields=["is_primary"])
        AuditLog.objects.create(
            user=request.user, action="delete_barcode", entity_type="item",
            entity_id=str(item.id),
            details={"item_code": item.item_code, "barcode": barcode_val},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    # POST = set_primary
    item.barcodes.update(is_primary=False)
    ib.is_primary = True
    ib.save(update_fields=["is_primary"])
    AuditLog.objects.create(
        user=request.user, action="set_primary_barcode", entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "barcode": ib.barcode},
    )
    return Response({"id": ib.id, "barcode": ib.barcode, "is_primary": True})


@api_view(["PATCH"])
@permission_classes([IsManager])
def update_item(request, item_id):
    """Update editable fields on an Item record. Managers: own outlet only. Admins: any."""
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and item.outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    prev_is_nbci = item.is_nbci

    serializer = ItemUpdateSerializer(item, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    new_barcode = serializer.validated_data.pop("barcode", None)
    updated = serializer.save()

    if new_barcode:
        if ItemBarcode.objects.filter(outlet=item.outlet, barcode=new_barcode).exclude(item=item).exists():
            return Response({"detail": "This barcode is already assigned to another item in this outlet."}, status=status.HTTP_400_BAD_REQUEST)
        ItemBarcode.objects.get_or_create(
            item=item, outlet=item.outlet, barcode=new_barcode,
            defaults={"is_primary": not item.barcodes.exists(), "assigned_by": request.user},
        )

    # NBCI toggle side-effects:
    #   False -> True : close any open pending requests, activate the item.
    #   True  -> False: re-open a NEW_CODE pending request if no barcode yet.
    nbci_now = updated.is_nbci
    if nbci_now != prev_is_nbci:
        if nbci_now:
            PendingItem.objects.filter(
                first_seen_outlet=updated.outlet,
                item_code=updated.item_code,
                status=PendingItem.Status.PENDING,
            ).update(status=PendingItem.Status.ASSIGNED, staff_note="Resolved as NBCI")
            if not updated.barcodes.exists():
                updated.status = Item.Status.ACTIVE
                updated.save(update_fields=["status"])
        else:
            if not updated.barcodes.exists():
                PendingItem.objects.get_or_create(
                    first_seen_outlet=updated.outlet,
                    item_code=updated.item_code,
                    status=PendingItem.Status.PENDING,
                    defaults={
                        "item_name": updated.item_name,
                        "change_type": PendingItem.ChangeType.NEW_CODE,
                        "item": updated,
                        "staff_note": "Re-opened after NBCI cleared",
                    },
                )
                updated.status = Item.Status.PENDING_BARCODE
                updated.save(update_fields=["status"])

    AuditLog.objects.create(
        user=request.user,
        action="update_item",
        entity_type="item",
        entity_id=str(updated.id),
        details={"item_code": updated.item_code, "changes": request.data},
    )

    return Response(ItemSerializer(updated).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsManager])
def mark_pending_nbci(request, pending_id):
    """
    Resolve a PENDING NEW_CODE entry by marking the item as Non-Barcoded (NBCI).
    Creates/activates the outlet Item with is_nbci=True and closes the pending row.
    """
    try:
        pending = PendingItem.objects.select_related("first_seen_outlet").get(
            pk=pending_id,
            status=PendingItem.Status.PENDING,
            change_type=PendingItem.ChangeType.NEW_CODE,
        )
    except PendingItem.DoesNotExist:
        return Response({"detail": "Pending item not found."}, status=status.HTTP_404_NOT_FOUND)

    outlet = pending.first_seen_outlet
    if request.user.role != "admin" and outlet != request.user.outlet:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    item, _ = Item.objects.get_or_create(
        outlet=outlet,
        item_code=pending.item_code,
        defaults={"item_name": pending.item_name},
    )
    item.is_nbci = True
    item.status = Item.Status.ACTIVE
    item.save(update_fields=["is_nbci", "status"])

    pending.status = PendingItem.Status.ASSIGNED
    pending.staff_note = "Resolved as NBCI"
    pending.save(update_fields=["status", "staff_note"])

    AuditLog.objects.create(
        user=request.user,
        action="mark_nbci",
        entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "pending_id": pending.id},
    )

    return Response({"status": "ok", "item_id": item.id})


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
        barcode_item_ids = ItemBarcode.objects.filter(barcode__icontains=q).values_list('item_id', flat=True)
        qs = qs.filter(
            Q(item_name__icontains=q) | Q(item_code__icontains=q) | Q(id__in=barcode_item_ids)
        )

    category = request.query_params.get("category", "").strip()
    if category:
        qs = qs.filter(category=category)

    category_id = request.query_params.get("category_id", "").strip()
    if category_id:
        try:
            qs = qs.filter(category_ref_id=int(category_id))
        except (ValueError, TypeError):
            pass

    # Daily-count filter for the CatalogPage toggle. Must run at DB level so
    # the toggle spans every daily-count item in the outlet, not just the
    # current page (which was the pre-fix behaviour).
    if request.query_params.get("daily_only") in ("1", "true", "True"):
        qs = qs.filter(is_daily_count=True)

    # Annotate with latest snapshot prices + qty via subquery (single SQL query, no N+1)
    latest_snap = PosSnapshot.objects.filter(item=OuterRef("pk")).order_by("-snapshot_date")
    qs = qs.select_related("outlet").annotate(
        latest_selling_price=Subquery(latest_snap.values("selling_price")[:1]),
        latest_cost_price=Subquery(latest_snap.values("cost_price")[:1]),
        latest_snapshot_date=Subquery(latest_snap.values("snapshot_date")[:1]),
        latest_pos_qty=Subquery(latest_snap.values("pos_quantity")[:1]),
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

    item_ids = [i.id for i in items]
    barcode_map = {}
    for ib in ItemBarcode.objects.filter(item_id__in=item_ids).order_by('-is_primary'):
        barcode_map.setdefault(ib.item_id, []).append(ib.barcode)

    # Stock-age data for this page of items, keyed by item_id. Single query.
    from apps.org_catalog.models import StockAgeSnapshot
    age_by_item = {
        s.item_id: s for s in StockAgeSnapshot.objects.filter(item_id__in=item_ids)
    }

    results = []
    for item in items:
        barcodes = barcode_map.get(item.id, [])
        age = age_by_item.get(item.id)
        results.append({
            "id": item.id,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "barcode": barcodes[0] if barcodes else None,
            "barcodes": barcodes,
            "category": item.category,
            "category_ref_id": item.category_ref_id,
            "rack_number": item.rack_number,
            "shelf": item.shelf,
            "status": item.status,
            "is_nbci": item.is_nbci,
            "is_daily_count": item.is_daily_count,
            "outlet_name": item.outlet.outlet_name,
            "latest_selling_price": str(item.latest_selling_price) if item.latest_selling_price is not None else None,
            "latest_cost_price": str(item.latest_cost_price) if item.latest_cost_price is not None else None,
            "latest_snapshot_date": str(item.latest_snapshot_date) if item.latest_snapshot_date else None,
            "latest_pos_qty": str(item.latest_pos_qty) if item.latest_pos_qty is not None else None,
            "on_hand": str(item.on_hand) if item.on_hand is not None else None,
            "sell_price": str(item.sell_price) if item.sell_price is not None else None,
            "cost_price": str(item.cost_price) if item.cost_price is not None else None,
            "reorder_level": str(item.reorder_level) if item.reorder_level is not None else None,
            "oldest_lot_age_days": age.oldest_lot_age_days if age else None,
            "weighted_avg_age_days": age.weighted_avg_age_days if age else None,
            "stock_age_computed_at": age.computed_at.isoformat() if age and age.computed_at else None,
        })

    return Response({
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "results": results,
    })


@api_view(["GET"])
@permission_classes([IsStoreUser])
def item_lookup(request):
    """
    Look up a single item for the store-user's outlet by either barcode or item_id.
    Used by the mobile barcode scan app and the name-search flow.

    GET /api/items/lookup/?barcode=<value>
    GET /api/items/lookup/?item_id=<id>

    Returns item details + latest POS prices + today's count status.
    Returns 404 if not found in this outlet.
    """
    barcode = request.query_params.get("barcode", "").strip()
    item_id = request.query_params.get("item_id", "").strip()

    if not barcode and not item_id:
        return Response(
            {"detail": "barcode or item_id query param required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if item_id:
        try:
            item = Item.objects.select_related("outlet").get(
                pk=item_id, outlet=request.user.outlet
            )
        except (Item.DoesNotExist, ValueError):
            return Response({"detail": "Item not found in this outlet."}, status=status.HTTP_404_NOT_FOUND)
        barcode = item.primary_barcode or ""
    else:
        try:
            item_barcode = ItemBarcode.objects.select_related('item', 'item__outlet').get(
                barcode=barcode, outlet=request.user.outlet
            )
            item = item_barcode.item
        except ItemBarcode.DoesNotExist:
            return Response({"detail": "Item not found for this barcode."}, status=status.HTTP_404_NOT_FOUND)

    # Latest POS snapshot prices
    latest_snap = PosSnapshot.objects.filter(item=item).order_by("-snapshot_date").first()
    sell_price = str(latest_snap.selling_price) if latest_snap and latest_snap.selling_price is not None else None
    cost_price = str(latest_snap.cost_price) if latest_snap and latest_snap.cost_price is not None else None

    # Today's counts (may be multiple if item counted in several locations)
    from apps.dashboard.models import StockCount
    today = timezone.localdate()
    today_counts_qs = StockCount.objects.filter(
        outlet=request.user.outlet, item=item, count_date=today
    ).order_by("counted_at")

    today_counts = [
        {
            "location_tag": c.location_tag or "",
            "actual_qty": str(c.actual_qty),
            "counted_at": c.counted_at.strftime("%-I:%M %p") if c.counted_at else None,
        }
        for c in today_counts_qs
    ]

    all_barcodes = list(item.barcodes.values_list('barcode', flat=True))

    return Response({
        "item_id": item.id,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "barcode": barcode,
        "barcodes": all_barcodes,
        "category": item.category,
        "sell_price": sell_price,
        "cost_price": cost_price,
        "already_counted_today": len(today_counts) > 0,
        "today_counts": today_counts,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def item_price_history(request, item_id):
    """
    Paginated daily POS snapshot history for a product, with change markers.

    Each row shows pos_quantity, selling_price, cost_price for that day.
    Fields that changed vs the previous day are flagged in `changed`.

    Query params:
      page      — page number (default 1)
      page_size — rows per page (default 60, max 365)
    """
    user = request.user
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if user.role != "admin" and item.outlet != user.outlet:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    try:
        page = max(1, int(request.query_params.get("page", 1)))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = min(int(request.query_params.get("page_size", 60)), 365)
    except (ValueError, TypeError):
        page_size = 60

    qs = PosSnapshot.objects.filter(item=item).order_by("-snapshot_date")
    total = qs.count()

    # Fetch one extra row before the page to enable change detection on first row
    offset = (page - 1) * page_size
    rows = list(qs[max(0, offset - 1): offset + page_size])

    # If we fetched the "look-behind" row, separate it
    if offset > 0:
        lookbehind = rows[0]
        page_rows = rows[1:]
    else:
        lookbehind = None
        page_rows = rows

    def _dec(val):
        return float(val) if val is not None else None

    history = []
    # Rows are newest-first; compare each row to the one AFTER it (older)
    for i, snap in enumerate(page_rows):
        # Previous day = next item in the list (since list is desc)
        prev = page_rows[i + 1] if i + 1 < len(page_rows) else lookbehind
        changed = {}
        if prev:
            if snap.pos_quantity != prev.pos_quantity:
                changed["pos_quantity"] = {"old": _dec(prev.pos_quantity), "new": _dec(snap.pos_quantity)}
            if snap.selling_price != prev.selling_price:
                changed["selling_price"] = {"old": _dec(prev.selling_price), "new": _dec(snap.selling_price)}
            if snap.cost_price != prev.cost_price:
                changed["cost_price"] = {"old": _dec(prev.cost_price), "new": _dec(snap.cost_price)}

        history.append({
            "snapshot_date": str(snap.snapshot_date),
            "pos_quantity": _dec(snap.pos_quantity),
            "selling_price": _dec(snap.selling_price),
            "cost_price": _dec(snap.cost_price),
            "uploaded_at": snap.uploaded_at.isoformat(),
            "uploaded_by": snap.uploaded_by.username if snap.uploaded_by else None,
            "changed": changed,
        })

    return Response({
        "item_id": item.id,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "barcode": item.primary_barcode,
        "barcodes": list(item.barcodes.values_list('barcode', flat=True)),
        "category": item.category,
        "outlet_name": item.outlet.outlet_name if item.outlet else None,
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "history": history,
    })


@api_view(["GET"])
@permission_classes([IsManager])
def item_history(request, item_id):
    """
    Merged per-product timeline — POS snapshots, item field edits, barcode events,
    physical counts, and the creation event. Newest first.

    Managers: only their own outlet's items. Admins: any item.
    """
    from apps.dashboard.models import StockCount
    user = request.user
    try:
        item = Item.objects.select_related("outlet").get(pk=item_id)
    except Item.DoesNotExist:
        return Response({"detail": "Item not found."}, status=status.HTTP_404_NOT_FOUND)

    if user.role != "admin" and item.outlet != user.outlet:
        return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    events = []

    # 1. Creation event
    events.append({
        "event_type": "created",
        "ts": item.created_at.isoformat(),
        "payload": {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "outlet": item.outlet.outlet_name if item.outlet else None,
        },
        "user": None,
    })

    # 2. POS snapshots (oldest-to-newest for delta computation, then sorted desc at the end)
    snaps = list(PosSnapshot.objects.filter(item=item).order_by("snapshot_date"))
    prev = None
    for snap in snaps:
        delta = {}
        if prev:
            if snap.pos_quantity != prev.pos_quantity:
                delta["pos_quantity"] = {"old": float(prev.pos_quantity), "new": float(snap.pos_quantity)}
            if snap.cost_price != prev.cost_price:
                delta["cost_price"] = {
                    "old": float(prev.cost_price) if prev.cost_price is not None else None,
                    "new": float(snap.cost_price) if snap.cost_price is not None else None,
                }
            if snap.selling_price != prev.selling_price:
                delta["selling_price"] = {
                    "old": float(prev.selling_price) if prev.selling_price is not None else None,
                    "new": float(snap.selling_price) if snap.selling_price is not None else None,
                }
        events.append({
            "event_type": "pos_snapshot",
            "ts": snap.uploaded_at.isoformat(),
            "date": str(snap.snapshot_date),
            "payload": {
                "snapshot_date": str(snap.snapshot_date),
                "pos_quantity": float(snap.pos_quantity),
                "cost_price": float(snap.cost_price) if snap.cost_price is not None else None,
                "selling_price": float(snap.selling_price) if snap.selling_price is not None else None,
                "delta": delta,
            },
            "user": snap.uploaded_by.username if snap.uploaded_by else None,
        })
        prev = snap

    # 3. Pending-item changes that were acted on (ASSIGNED or REJECTED)
    changes = PendingItem.objects.filter(item=item).exclude(status=PendingItem.Status.PENDING)
    for ch in changes:
        events.append({
            "event_type": "item_change",
            "ts": ch.created_at.isoformat(),
            "payload": {
                "change_type": ch.change_type,
                "status": ch.status,
                "changed_fields": ch.changed_fields,
                "staff_note": ch.staff_note,
            },
            "user": None,
        })

    # 4. Audit log entries for this item
    audits = AuditLog.objects.filter(entity_type="item", entity_id=str(item.id)).select_related("user")
    for a in audits:
        events.append({
            "event_type": "audit",
            "ts": a.created_at.isoformat(),
            "payload": {
                "action": a.action,
                "details": a.details,
            },
            "user": a.user.username if a.user else None,
        })

    # 5. Barcode events
    for b in item.barcodes.select_related("assigned_by").all():
        events.append({
            "event_type": "barcode",
            "ts": b.assigned_at.isoformat(),
            "payload": {
                "barcode": b.barcode,
                "is_primary": b.is_primary,
            },
            "user": b.assigned_by.username if b.assigned_by else None,
        })

    # 6. Physical stock counts
    for c in StockCount.objects.filter(item=item).select_related("counted_by"):
        events.append({
            "event_type": "physical_count",
            "ts": c.counted_at.isoformat() if c.counted_at else None,
            "date": str(c.count_date),
            "payload": {
                "count_date": str(c.count_date),
                "actual_qty": float(c.actual_qty),
                "location_tag": c.location_tag or "",
            },
            "user": c.counted_by.username if c.counted_by else None,
        })

    events.sort(key=lambda e: e["ts"] or "", reverse=True)

    return Response({
        "item_id": item.id,
        "item_code": item.item_code,
        "item_name": item.item_name,
        "outlet_id": item.outlet_id,
        "outlet_name": item.outlet.outlet_name if item.outlet else None,
        "primary_barcode": item.primary_barcode,
        "barcodes": list(item.barcodes.values_list("barcode", flat=True)),
        "category": item.category,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "events": events,
    })


@api_view(["GET", "POST"])
@permission_classes([IsManager])
def outlet_barcode_master(request, outlet_id):
    """
    Outlet-scoped barcode master.

    GET  /api/outlets/{outlet_id}/barcodes/  — list all barcodes for the outlet.
         Query params: q (barcode/item_code/item_name search), is_primary (true|false),
         page, page_size.
    POST /api/outlets/{outlet_id}/barcodes/  — create a barcode.
         Body: { item_id, barcode, is_primary }. Enforces per-outlet uniqueness.
         On conflict returns 409 with the conflicting item_code.

    Managers are scoped to their own outlet; admins may access any outlet.
    """
    from apps.outlets.models import Outlet
    try:
        outlet = Outlet.objects.get(pk=outlet_id)
    except Outlet.DoesNotExist:
        return Response({"detail": "Outlet not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.user.role != "admin" and request.user.outlet_id != outlet.id:
        return Response({"detail": "Not authorized for this outlet."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = (
            ItemBarcode.objects
            .filter(outlet=outlet)
            .select_related("item", "assigned_by")
            .order_by("-is_primary", "item__item_code", "assigned_at")
        )

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(barcode__icontains=q)
                | Q(item__item_code__icontains=q)
                | Q(item__item_name__icontains=q)
            )

        is_primary = request.query_params.get("is_primary")
        if is_primary in ("true", "1"):
            qs = qs.filter(is_primary=True)
        elif is_primary in ("false", "0"):
            qs = qs.filter(is_primary=False)

        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = min(max(1, int(request.query_params.get("page_size", 50))), 200)
        except (ValueError, TypeError):
            page_size = 50

        total = qs.count()
        offset = (page - 1) * page_size
        rows = qs[offset: offset + page_size]

        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "results": [
                {
                    "id": b.id,
                    "barcode": b.barcode,
                    "is_primary": b.is_primary,
                    "item_id": b.item_id,
                    "item_code": b.item.item_code,
                    "item_name": b.item.item_name,
                    "assigned_at": b.assigned_at.isoformat(),
                    "assigned_by_username": b.assigned_by.username if b.assigned_by else None,
                }
                for b in rows
            ],
        })

    # POST — create a barcode
    item_id = request.data.get("item_id")
    barcode_val = (request.data.get("barcode") or "").strip()
    make_primary = bool(request.data.get("is_primary"))

    if not item_id or not barcode_val:
        return Response(
            {"detail": "item_id and barcode are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        item = Item.objects.get(pk=item_id, outlet=outlet)
    except Item.DoesNotExist:
        return Response(
            {"detail": "Item not found in this outlet."},
            status=status.HTTP_404_NOT_FOUND,
        )

    existing = ItemBarcode.objects.filter(outlet=outlet, barcode=barcode_val).select_related("item").first()
    if existing:
        return Response(
            {
                "detail": "This barcode is already assigned in this outlet.",
                "conflict": {
                    "item_id": existing.item_id,
                    "item_code": existing.item.item_code,
                    "item_name": existing.item.item_name,
                },
            },
            status=status.HTTP_409_CONFLICT,
        )

    device_uuid = get_device_uuid(request)
    touch_device(request, action="assign")

    is_first = not item.barcodes.exists()
    if make_primary or is_first:
        item.barcodes.update(is_primary=False)

    ib = ItemBarcode.objects.create(
        item=item,
        outlet=outlet,
        barcode=barcode_val,
        is_primary=make_primary or is_first,
        assigned_by=request.user,
        device_uuid=device_uuid,
    )

    if is_first:
        item.status = Item.Status.ACTIVE
        item.barcode_assigned_at = timezone.now()
        item.barcode_assigned_by = request.user
        item.save(update_fields=["status", "barcode_assigned_at", "barcode_assigned_by"])

    AuditLog.objects.create(
        user=request.user,
        action="add_barcode",
        entity_type="item",
        entity_id=str(item.id),
        details={"item_code": item.item_code, "barcode": barcode_val, "outlet": outlet.outlet_name},
    )

    return Response(
        {
            "id": ib.id,
            "barcode": ib.barcode,
            "is_primary": ib.is_primary,
            "item_id": item.id,
            "item_code": item.item_code,
            "item_name": item.item_name,
            "assigned_at": ib.assigned_at.isoformat(),
            "assigned_by_username": request.user.username,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAdmin])
def negative_pos_report(request):
    """
    Admin report: items with negative POS quantity for a given date, grouped by outlet.

    Query params:
      date   — snapshot date (YYYY-MM-DD, required)
      outlet — outlet id (optional, filter to one outlet)

    Response:
      { date, outlets: [{ outlet_id, outlet_name, total_cost_value, items: [...] }] }
    """
    date_param = request.query_params.get("date", "").strip()
    if not date_param:
        return Response({"detail": "date query param is required (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)

    qs = (
        PosSnapshot.objects
        .filter(pos_quantity__lt=0, snapshot_date=date_param)
        .select_related("item", "item__outlet")
        .order_by("item__outlet__outlet_name", "item__item_code")
    )

    outlet_filter = request.query_params.get("outlet", "").strip()
    if outlet_filter:
        qs = qs.filter(outlet_id=outlet_filter)

    # Group by outlet
    outlets_map = defaultdict(lambda: {"outlet_id": None, "outlet_name": "", "items": [], "total_cost_value": Decimal("0")})

    for snap in qs:
        outlet = snap.item.outlet
        key = outlet.id
        entry = outlets_map[key]
        entry["outlet_id"] = outlet.id
        entry["outlet_name"] = outlet.outlet_name

        qty = snap.pos_quantity  # negative
        cost = snap.cost_price or Decimal("0")
        line_cost_value = abs(qty) * cost

        entry["items"].append({
            "item_code": snap.item.item_code,
            "item_name": snap.item.item_name,
            "pos_quantity": float(qty),
            "selling_price": float(snap.selling_price) if snap.selling_price is not None else None,
            "cost_price": float(cost),
            "line_cost_value": float(line_cost_value),
        })
        entry["total_cost_value"] += line_cost_value

    outlets = []
    for entry in outlets_map.values():
        outlets.append({
            "outlet_id": entry["outlet_id"],
            "outlet_name": entry["outlet_name"],
            "total_cost_value": float(entry["total_cost_value"]),
            "items": entry["items"],
        })

    return Response({"date": date_param, "outlets": outlets})
