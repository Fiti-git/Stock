from django.db import models


class CountSession(models.Model):
    """
    Groups stock counts for a single (outlet, count_date). A session is the
    unit of review: managers close a session to freeze its counts, then
    reconciliation produces VarianceRecord rows for each item.

    Sessions are created lazily by submit_count — the mobile app has no
    awareness of them. One open session exists per (outlet, count_date).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="count_sessions",
    )
    count_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    started_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="started_count_sessions",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    closed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_count_sessions",
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "count_sessions"
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["outlet", "count_date"]),
            models.Index(fields=["status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["outlet", "count_date"],
                condition=models.Q(status="open"),
                name="uniq_open_session_per_outlet_date",
            ),
        ]

    def __str__(self):
        return f"Session {self.outlet_id}@{self.count_date} ({self.status})"


class StockCount(models.Model):
    class ApprovalStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="stock_counts",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="stock_counts",
    )
    count_date = models.DateField()
    actual_qty = models.DecimalField(max_digits=12, decimal_places=3)
    location_tag = models.CharField(max_length=100, blank=True, default="")
    counted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="stock_counts",
    )
    counted_at = models.DateTimeField(auto_now_add=True)
    is_month_end = models.BooleanField(default=False)
    device_uuid = models.CharField(max_length=64, blank=True, default="")

    # Frozen POS qty as at the moment this count was submitted. Populated by
    # the write path (submit_count / recount / admin edit) using the latest
    # PosSnapshot for (outlet, item) with snapshot_date <= today. Once set,
    # NEVER updated — subsequent POS uploads must not retroactively change
    # historical variance. NULL only for legacy rows (pre-migration counts
    # with no snapshot at backfill time) and for items that never had a
    # PosSnapshot at all.
    pos_qty_at_count = models.DecimalField(
        max_digits=12, decimal_places=3, null=True, blank=True,
    )
    pos_snapshot_at_count = models.ForeignKey(
        "uploads.PosSnapshot",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    session = models.ForeignKey(
        CountSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="counts",
    )
    approval_status = models.CharField(
        max_length=12,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.SUBMITTED,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_counts",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True, default="")
    flagged_outlier = models.BooleanField(default=False)

    class Meta:
        db_table = "stock_counts"
        ordering = ["-counted_at"]
        indexes = [
            models.Index(fields=["outlet", "count_date"]),
            models.Index(fields=["approval_status"]),
            models.Index(fields=["session"]),
        ]

    def __str__(self):
        return f"{self.outlet} / {self.item.item_code} @ {self.count_date} = {self.actual_qty}"


class VarianceRecord(models.Model):
    """
    One row per (outlet, item, count_date) where POS qty and physical count
    differ. Generated by closing a CountSession. Managers resolve each row
    with a status + note, optionally applying an inventory adjustment.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        INVESTIGATING = "investigating", "Investigating"
        EXPLAINED = "explained", "Explained"
        ADJUSTED = "adjusted", "Adjusted"
        WRITTEN_OFF = "written_off", "Written off"
        CLOSED = "closed", "Closed"

    session = models.ForeignKey(
        CountSession,
        on_delete=models.CASCADE,
        related_name="variances",
    )
    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="variance_records",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="variance_records",
    )
    count_date = models.DateField()
    pos_qty = models.DecimalField(max_digits=12, decimal_places=3)
    counted_qty = models.DecimalField(max_digits=12, decimal_places=3)
    variance_qty = models.DecimalField(max_digits=12, decimal_places=3)
    variance_value = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    resolution_note = models.CharField(max_length=1000, blank=True, default="")
    adjustment_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    resolved_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_variances",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "variance_records"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["outlet", "count_date"]),
            models.Index(fields=["status"]),
            models.Index(fields=["session"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "item"],
                name="uniq_variance_per_session_item",
            ),
        ]

    def __str__(self):
        return f"Variance {self.item_id}@{self.count_date} {self.variance_qty}"
