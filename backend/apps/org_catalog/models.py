from django.db import models


class MasterProduct(models.Model):
    """
    Org-level canonical product. Outlet Items are linked to one of these via
    ItemMasterLink so that sales/demand/purchasing can aggregate across outlets
    even when each outlet uses its own item_code for the same physical product.
    """

    class Unit(models.TextChoices):
        EACH = "EA", "Each"
        KG = "KG", "Kilogram"
        G = "G", "Gram"
        L = "L", "Litre"
        ML = "ML", "Millilitre"
        PACK = "PK", "Pack"

    master_code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=300)
    brand = models.CharField(max_length=200, blank=True, default="")
    pack_size = models.CharField(max_length=50, blank=True, default="")
    unit = models.CharField(max_length=4, choices=Unit.choices, default=Unit.EACH)

    category = models.ForeignKey(
        "items.Category",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="master_products",
    )
    default_supplier = models.ForeignKey(
        "uploads.Supplier",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="master_products",
    )

    min_order_qty = models.PositiveIntegerField(default=1)
    pack_multiple = models.PositiveIntegerField(default=1)
    target_days_of_cover = models.PositiveIntegerField(default=14)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "org_master_products"
        ordering = ["master_code"]

    def __str__(self):
        return f"{self.master_code} — {self.name}"


class ItemMasterLink(models.Model):
    """
    Maps a per-outlet Item to its canonical MasterProduct. A single Item belongs
    to at most one master (OneToOne). Unlinked Items are invisible to org-level
    aggregations — same philosophy as the existing orphan cleanup flow.
    """

    item = models.OneToOneField(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="master_link",
    )
    master_product = models.ForeignKey(
        MasterProduct,
        on_delete=models.CASCADE,
        related_name="item_links",
    )
    linked_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    linked_at = models.DateTimeField(auto_now_add=True)
    # Score from the suggestion engine when auto-applied; null for manual links.
    confidence = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = "org_item_master_links"
        ordering = ["-linked_at"]

    def __str__(self):
        return f"{self.item_id} → {self.master_product.master_code}"


class DemandSnapshot(models.Model):
    """
    Nightly-rebuilt aggregate of sales velocity per (MasterProduct, Outlet).
    Rolling averages are derived from approved SalesLine rows in the last 90
    days. Live aggregation is too slow for dashboards at the volume the POS
    pushes, so we materialize here.
    """

    master_product = models.ForeignKey(
        MasterProduct,
        on_delete=models.CASCADE,
        related_name="demand_snapshots",
    )
    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="demand_snapshots",
    )
    avg_daily_qty_7d = models.FloatField(default=0)
    avg_daily_qty_30d = models.FloatField(default=0)
    avg_daily_qty_90d = models.FloatField(default=0)
    total_qty_30d = models.FloatField(default=0)
    last_sale_date = models.DateField(null=True, blank=True)
    on_hand_qty = models.FloatField(null=True, blank=True)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "org_demand_snapshots"
        unique_together = [("master_product", "outlet")]
        indexes = [
            models.Index(fields=["master_product", "outlet"]),
            models.Index(fields=["computed_at"]),
        ]

    def __str__(self):
        return f"{self.master_product_id}@{self.outlet_id}"


class StockAgeSnapshot(models.Model):
    """
    Nightly-rebuilt (and on-demand recomputable) FIFO stock-age view per
    (Outlet, Item). Each lot = one inbound row from GrnLine / VerificationLine
    (qty > 0) / SalesReturnLine. Outbound rows (SalesLine, DamageLine,
    OfficeLine, RtsLine, VerificationLine qty < 0) consume oldest lots first.
    The remaining per-lot quantities feed the aging buckets and average-age
    stats stored here. The totals are reconciled against the latest PosSnapshot
    so the page never silently disagrees with the authoritative POS number —
    any gap lands in `unknown_age_qty`.
    """

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="stock_age_snapshots",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="stock_age_snapshots",
    )
    master_product = models.ForeignKey(
        MasterProduct,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stock_age_snapshots",
    )
    on_hand_qty = models.FloatField(default=0)
    oldest_lot_date = models.DateField(null=True, blank=True)
    oldest_lot_age_days = models.IntegerField(default=0)
    weighted_avg_age_days = models.FloatField(default=0)
    bucket_0_30 = models.FloatField(default=0)
    bucket_31_60 = models.FloatField(default=0)
    bucket_61_90 = models.FloatField(default=0)
    bucket_90_plus = models.FloatField(default=0)
    unknown_age_qty = models.FloatField(default=0)
    latest_pos_qty = models.FloatField(null=True, blank=True)
    latest_pos_date = models.DateField(null=True, blank=True)
    on_hand_value = models.FloatField(default=0)
    computed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock_age_snapshots"
        unique_together = [("outlet", "item")]
        indexes = [
            models.Index(fields=["outlet", "item"]),
            models.Index(fields=["oldest_lot_age_days"]),
            models.Index(fields=["computed_at"]),
        ]

    def __str__(self):
        return f"StockAge {self.outlet_id}/{self.item_id} age={self.oldest_lot_age_days}d"


class PurchasePlan(models.Model):
    """
    A purchasing proposal covering some subset of (MasterProduct, Outlet)
    pairs. `mode` decides whether lines are consolidated across outlets into a
    single supplier PO or split per outlet.
    """

    class Mode(models.TextChoices):
        CONSOLIDATED = "consolidated", "Consolidated per supplier"
        PER_OUTLET = "per_outlet", "Per outlet"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        APPROVED = "approved", "Approved"
        SENT = "sent", "Sent"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=200)
    mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.CONSOLIDATED)
    supplier = models.ForeignKey(
        "uploads.Supplier",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="purchase_plans",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="purchase_plans",
    )
    approved_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_purchase_plans",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "org_purchase_plans"
        ordering = ["-created_at"]


class PurchasePlanLine(models.Model):
    """
    A single line inside a PurchasePlan. `outlet` is null when the plan is
    CONSOLIDATED and the line sums across outlets; the allocation map is
    preserved in `allocation` so the receipt workflow can split the PO back
    to individual outlets.
    """

    plan = models.ForeignKey(
        PurchasePlan,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    master_product = models.ForeignKey(
        MasterProduct,
        on_delete=models.PROTECT,
        related_name="+",
    )
    outlet = models.ForeignKey(
        "outlets.Outlet",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    suggested_qty = models.FloatField(default=0)
    final_qty = models.FloatField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    # For CONSOLIDATED lines: {outlet_id: qty, ...} so receipts can split back.
    allocation = models.JSONField(default=dict, blank=True)
    notes = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        db_table = "org_purchase_plan_lines"
        ordering = ["master_product_id", "outlet_id"]
