from django.db import models


class UnitOfMeasure(models.Model):
    """
    A unit of measure: PCS, KG, G, L, ML, BOX12, CASE24, etc.

    `is_weight` flags units that imply weighing (KG, G, L, ML) so the
    POS UI can route weighed-barcode scans correctly. `precision`
    bounds how many decimal places a quantity in this unit may carry.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=80)
    is_weight = models.BooleanField(default=False)
    precision = models.IntegerField(default=0)

    class Meta:
        db_table = "units_of_measure"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


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

    # Multi-unit / weighed (Phase 2 Agent 6).
    # base_unit is the unit `on_hand`, `cost_price` and `sell_price` are
    # denominated in. Null = legacy item — treat as PCS-equivalent and skip
    # unit conversions in the POS path.
    base_unit = models.ForeignKey(
        "items.UnitOfMeasure",
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    is_weighed = models.BooleanField(default=False)
    # 5-digit body of an EAN-13 type-2 weighed barcode ("2 PPPPP WWWWW C").
    # The POS scanner uses this to map a scanned weighed barcode back to
    # the originating Item.
    weighed_barcode_prefix = models.CharField(max_length=10, blank=True, default="")
    # PLU number embedded in EAN-13 type-2 weighed barcodes (alias for
    # `weighed_barcode_prefix`, exposed under the canonical Phase-2 name).
    plu_code = models.CharField(max_length=10, blank=True, default="")
    # Optional simple pack-unit fields. Co-exist with the richer ItemPackUnit
    # rows: these support the "single pack size per item" common case and
    # power the POS unit-toggle (Each / Pack).
    pack_unit = models.ForeignKey(
        "items.UnitOfMeasure",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    pack_size = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    pack_sell_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
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

    def save(self, *args, **kwargs):
        # Default base_unit to "EA" / "PCS" if absent — pick the first match
        # so legacy seeds (PCS) and new seeds (EA) both work.
        if self.base_unit_id is None:
            try:
                self.base_unit = UnitOfMeasure.objects.filter(code__in=["EA", "PCS"]).first()
            except Exception:
                pass
        # Sync is_weighed flag from base_unit.
        if self.base_unit_id:
            try:
                self.is_weighed = bool(getattr(self.base_unit, "is_weight", False))
            except Exception:
                pass
        # Mirror plu_code <-> weighed_barcode_prefix (legacy field name).
        if self.plu_code and not self.weighed_barcode_prefix:
            self.weighed_barcode_prefix = self.plu_code
        elif self.weighed_barcode_prefix and not self.plu_code:
            self.plu_code = self.weighed_barcode_prefix
        super().save(*args, **kwargs)

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


class ItemBatch(models.Model):
    """
    A receipt-tracked batch of stock for a single item. Used for FEFO
    consumption (earliest expiry first) and near-expiry reporting.
    """
    item = models.ForeignKey(
        Item, on_delete=models.PROTECT, related_name="batches",
    )
    batch_no = models.CharField(max_length=80)
    expiry_date = models.DateField(null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    received_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    supplier = models.ForeignKey(
        "uploads.Supplier", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="item_batches",
    )
    grn_ref = models.CharField(max_length=80, blank=True, default="")
    received_at = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "item_batches"
        indexes = [
            models.Index(fields=["item", "expiry_date"]),
            models.Index(fields=["item", "is_active"]),
            models.Index(fields=["batch_no"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["item", "batch_no"], name="uniq_item_batch_no"),
        ]

    def __str__(self):
        return f"{self.item.item_code}/{self.batch_no} exp {self.expiry_date}"


class BatchMovement(models.Model):
    """Audit trail of qty changes against an ItemBatch (FEFO debugging)."""
    batch = models.ForeignKey(
        ItemBatch, on_delete=models.CASCADE, related_name="movements",
    )
    qty_change = models.DecimalField(max_digits=12, decimal_places=3)   # signed
    balance_after = models.DecimalField(max_digits=12, decimal_places=3)
    kind = models.CharField(max_length=20)   # "grn", "sale", "return", "adjust", "void"
    ref_type = models.CharField(max_length=80, blank=True, default="")
    ref_id = models.CharField(max_length=80, blank=True, default="")
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="batch_movements",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "batch_movements"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["batch", "-created_at"]),
        ]

    def __str__(self):
        return f"BatchMv {self.batch_id} {self.kind} {self.qty_change:+}"


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


class ItemPackUnit(models.Model):
    """
    Alternate (non-base) unit of sale for an Item.

    Example: an item stocked in PCS (base) with a BOX12 pack unit
    (conversion_factor=12). Selling 1 BOX12 deducts 12 PCS from on_hand.
    `sell_price` overrides the base-unit price when set; otherwise the
    POS layer derives it as base_unit_price * conversion_factor.
    """
    item = models.ForeignKey(
        Item, on_delete=models.CASCADE, related_name="pack_units",
    )
    unit = models.ForeignKey(
        "items.UnitOfMeasure", on_delete=models.PROTECT, related_name="+",
    )
    conversion_factor = models.DecimalField(max_digits=14, decimal_places=4)
    sell_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    barcode = models.CharField(max_length=80, blank=True, default="")
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "item_pack_units"
        constraints = [
            models.UniqueConstraint(fields=["item", "unit"], name="uniq_item_pack_unit"),
        ]
        indexes = [
            models.Index(fields=["item"]),
            models.Index(fields=["barcode"]),
        ]

    def __str__(self):
        return f"{self.item.item_code} × {self.unit.code} (×{self.conversion_factor})"
