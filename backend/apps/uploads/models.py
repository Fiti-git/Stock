from django.db import models


class PosSnapshot(models.Model):
    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="pos_snapshots",
    )
    item = models.ForeignKey(
        "items.Item",
        on_delete=models.CASCADE,
        related_name="pos_snapshots",
    )
    snapshot_date = models.DateField()
    pos_quantity = models.DecimalField(max_digits=12, decimal_places=3)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    uploaded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploads",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pos_snapshots"
        unique_together = ("outlet", "item", "snapshot_date")
        ordering = ["-snapshot_date"]

    def __str__(self):
        return f"{self.outlet} / {self.item.item_code} @ {self.snapshot_date}"


class UploadLog(models.Model):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto (same-day)"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey(
        "outlets.Outlet",
        on_delete=models.CASCADE,
        related_name="upload_logs",
    )
    snapshot_date = models.DateField()
    uploaded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="upload_logs",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    matched_rows = models.IntegerField(default=0)
    new_items_count = models.IntegerField(default=0)
    changed_items_count = models.IntegerField(default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(
        max_length=10,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.AUTO,
    )
    approved_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_uploads",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_uploads/", null=True, blank=True)

    class Meta:
        db_table = "upload_logs"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.outlet} upload {self.snapshot_date} ({self.status})"


class AuditLog(models.Model):
    user = models.ForeignKey(
        "accounts.User",
        null=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=50, blank=True)
    entity_id = models.CharField(max_length=50, blank=True)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
