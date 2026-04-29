"""
Inter-outlet stock transfer models.

State machine:
    DRAFT → REQUESTED → DISPATCHED → RECEIVED → VARIANCE_REVIEW → CLOSED
                                                       ↓
                                                    CLOSED
    Any pre-RECEIVED state may also transition → CANCELLED.

Each StockTransfer is a header. StockTransferLine rows carry the qty
fields (requested / dispatched / received) — variance is derived as
qty_dispatched - qty_received per line. TransferEvent rows form an
append-only audit trail of state transitions.
"""

from django.db import models


class StockTransfer(models.Model):
    class Status:
        DRAFT = "draft"
        REQUESTED = "requested"
        DISPATCHED = "dispatched"
        RECEIVED = "received"
        VARIANCE_REVIEW = "variance_review"
        CLOSED = "closed"
        CANCELLED = "cancelled"

        CHOICES = [
            (DRAFT, "Draft"),
            (REQUESTED, "Requested"),
            (DISPATCHED, "Dispatched"),
            (RECEIVED, "Received"),
            (VARIANCE_REVIEW, "Variance Review"),
            (CLOSED, "Closed"),
            (CANCELLED, "Cancelled"),
        ]

    ref_no = models.CharField(max_length=40, unique=True)
    source_outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.PROTECT,
        related_name="transfers_out",
    )
    dest_outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.PROTECT,
        related_name="transfers_in",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.CHOICES,
        default=Status.DRAFT,
    )

    requested_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="requested_transfers",
    )
    requested_at = models.DateTimeField(null=True, blank=True)
    dispatched_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="dispatched_transfers",
    )
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="received_transfers",
    )
    received_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="closed_transfers",
    )
    closed_at = models.DateTimeField(null=True, blank=True)

    note = models.CharField(max_length=500, blank=True, default="")
    variance_note = models.CharField(max_length=500, blank=True, default="")

    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_transfers",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock_transfers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["source_outlet", "status"]),
            models.Index(fields=["dest_outlet", "status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self):
        return f"{self.ref_no} {self.source_outlet_id}->{self.dest_outlet_id} [{self.status}]"


class StockTransferLine(models.Model):
    transfer = models.ForeignKey(
        StockTransfer, on_delete=models.CASCADE, related_name="lines",
    )
    item = models.ForeignKey(
        "items.Item", on_delete=models.PROTECT, related_name="transfer_lines",
    )
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=300)
    qty_requested = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty_dispatched = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty_received = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # FEFO snapshot — list of {"batch_id", "batch_no", "expiry_date", "qty"}
    batches_dispatched = models.JSONField(default=list, blank=True)
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "stock_transfer_lines"
        indexes = [
            models.Index(fields=["transfer"]),
            models.Index(fields=["item"]),
        ]

    def __str__(self):
        return f"{self.item_code} req={self.qty_requested} disp={self.qty_dispatched} recv={self.qty_received}"


class TransferEvent(models.Model):
    """Append-only audit trail of state transitions on a StockTransfer."""
    transfer = models.ForeignKey(
        StockTransfer, on_delete=models.CASCADE, related_name="events",
    )
    from_status = models.CharField(max_length=20, blank=True, default="")
    to_status = models.CharField(max_length=20)
    actor = models.ForeignKey(
        "accounts.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="transfer_events",
    )
    note = models.CharField(max_length=500, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "stock_transfer_events"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["transfer", "created_at"]),
        ]

    def __str__(self):
        return f"TransferEvent {self.transfer_id} {self.from_status}->{self.to_status}"
