from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.CharField(max_length=500, blank=True, default="")
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "item_categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Item(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PENDING_BARCODE = "pending_barcode", "Pending Barcode"

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="items",
    )
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=200, blank=True)
    category_ref = models.ForeignKey(
        "items.Category",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="items",
    )
    rack_number = models.CharField(max_length=50, blank=True, default='')
    shelf = models.CharField(max_length=50, blank=True, default='')
    # NBCI = Non-Barcoded Item. When True the item is legitimately without a
    # barcode (e.g. loose produce) and should not appear in the Pending Review
    # Queue. Flipping this back to False re-creates a pending request so a
    # barcode can be assigned later.
    is_nbci = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_BARCODE)
    created_at = models.DateTimeField(auto_now_add=True)

    # Inventory + pricing for in-house POS (separate from external PosSnapshot flow)
    on_hand = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    tax_rate_pct = models.DecimalField(max_digits=6, decimal_places=3, default=0)
    sell_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    barcode_assigned_at = models.DateTimeField(null=True, blank=True)
    barcode_assigned_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_barcodes",
    )
    # The UploadLog row that first introduced this item. Used to cleanly roll
    # back wrong-outlet uploads: deleting an UploadLog cascades to its Items.
    upload_log = models.ForeignKey(
        "uploads.UploadLog",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_items",
    )

    class Meta:
        db_table = "items"
        ordering = ["item_code"]
        unique_together = [("outlet", "item_code")]

    @property
    def primary_barcode(self):
        bc = self.barcodes.filter(is_primary=True).first()
        if bc:
            return bc.barcode
        bc = self.barcodes.first()
        return bc.barcode if bc else None

    def __str__(self):
        return f"{self.item_code} — {self.item_name}"


class ItemBarcode(models.Model):
    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name="barcodes",
    )
    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="item_barcodes",
    )
    barcode = models.CharField(max_length=100)
    is_primary = models.BooleanField(default=False)
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    device_uuid = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "item_barcodes"
        unique_together = [("outlet", "barcode")]
        ordering = ["-is_primary", "assigned_at"]

    def save(self, *args, **kwargs):
        if not self.outlet_id:
            self.outlet = self.item.outlet
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.barcode} → {self.item.item_code}"


class PendingItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ASSIGNED = "assigned", "Assigned"
        REJECTED = "rejected", "Rejected"

    class ChangeType(models.TextChoices):
        NEW_CODE = "new_code", "New Item Code"
        DATA_CHANGED = "data_changed", "Data Changed"

    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    first_seen_outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="pending_items",
    )
    first_seen_date = models.DateField(auto_now_add=True)
    staff_note = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    change_type = models.CharField(
        max_length=20,
        choices=ChangeType.choices,
        default=ChangeType.NEW_CODE,
    )
    # Populated for DATA_CHANGED: {"item_name": {"old": "...", "new": "..."}, ...}
    changed_fields = models.JSONField(default=dict, blank=True)
    # FK to the existing Item being changed (only for DATA_CHANGED)
    item = models.ForeignKey(
        "Item",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="change_requests",
    )
    # The UploadLog row that spawned this pending request. Lets delete_upload
    # cascade-clean both NEW_CODE and DATA_CHANGED requests in one shot.
    upload_log = models.ForeignKey(
        "uploads.UploadLog",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_pending_items",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pending_items"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Pending: {self.item_code} — {self.item_name} ({self.change_type})"


class StockMovement(models.Model):
    """
    Append-only ledger of stock changes. Every POS sale, void, return,
    GRN, damage, adjustment, or variance correction writes a row here.
    Item.on_hand is the running balance; this table is the audit trail.
    """

    class Kind(models.TextChoices):
        OPENING = "opening", "Opening Balance"
        SALE = "sale", "POS Sale"
        VOID = "void", "Bill Void"
        RETURN = "return", "Customer Return"
        GRN = "grn", "Goods Received"
        DAMAGE = "damage", "Damage / Wastage"
        ADJUSTMENT = "adjustment", "Manual Adjustment"
        VARIANCE = "variance", "Variance Correction"
        TRANSFER_IN = "transfer_in", "Transfer In"
        TRANSFER_OUT = "transfer_out", "Transfer Out"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="stock_movements")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="stock_movements")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    qty_change = models.DecimalField(max_digits=14, decimal_places=3)  # signed: sale negative, GRN positive
    balance_after = models.DecimalField(max_digits=14, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    ref_type = models.CharField(max_length=40, blank=True, default="")   # "Bill", "GRN", etc.
    ref_id = models.CharField(max_length=40, blank=True, default="")

    note = models.CharField(max_length=500, blank=True, default="")
    created_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="stock_movements")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_movements"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "item", "-created_at"]),
            models.Index(fields=["kind", "-created_at"]),
            models.Index(fields=["ref_type", "ref_id"]),
        ]

    def __str__(self):
        return f"{self.kind} {self.item_id} {self.qty_change:+}"


class ItemPriceHistory(models.Model):
    """Append-only log of sell/cost price changes per item."""
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="price_history")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="price_history")
    old_sell = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    new_sell = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    old_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    new_cost = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    source = models.CharField(max_length=40, blank=True, default="manual")   # manual, grn, bulk_update, api
    note = models.CharField(max_length=500, blank=True, default="")
    changed_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="price_changes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "item_price_history"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["item", "-created_at"]),
            models.Index(fields=["outlet", "-created_at"]),
        ]
