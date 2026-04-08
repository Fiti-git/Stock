from django.db import models


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
    barcode = models.CharField(max_length=100, blank=True, null=True, unique=True)
    category = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_BARCODE)
    created_at = models.DateTimeField(auto_now_add=True)
    barcode_assigned_at = models.DateTimeField(null=True, blank=True)
    barcode_assigned_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_barcodes",
    )

    class Meta:
        db_table = "items"
        ordering = ["item_code"]
        unique_together = [("outlet", "item_code")]

    def __str__(self):
        return f"{self.item_code} — {self.item_name}"


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pending_items"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Pending: {self.item_code} — {self.item_name} ({self.change_type})"
