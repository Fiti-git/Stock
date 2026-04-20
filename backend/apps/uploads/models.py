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


class DamageUploadBatch(models.Model):
    """
    Parent row for one 'Damage / Wastage Entry Listing' XLS upload. Each batch
    covers a date-range (date_from..date_to) for one outlet. Individual
    DamageLine rows FK back here so deleting the batch wipes only its own
    rows — the fundamental undo primitive.
    """
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="damage_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="damage_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)

    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_damage_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_damage/", null=True, blank=True)

    class Meta:
        db_table = "damage_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]

    def __str__(self):
        return f"Damage {self.outlet_id} {self.date_from}..{self.date_to} ({self.status})"


class DamageLine(models.Model):
    """One row from a Damage/Wastage listing."""
    batch = models.ForeignKey(DamageUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="damage_lines")
    doc_no = models.CharField(max_length=40)
    txn_date = models.DateField()
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    pack_size = models.CharField(max_length=20, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    user_name = models.CharField(max_length=80, blank=True)
    txn_time = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "damage_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "doc_no"]),
            models.Index(fields=["item_code"]),
        ]

    def __str__(self):
        return f"Damage {self.doc_no}/{self.item_code}@{self.txn_date}"


class OfficeUploadBatch(models.Model):
    """Parent row for one 'Office Use Listing [Details]' XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="office_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="office_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_office_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_office/", null=True, blank=True)

    class Meta:
        db_table = "office_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class OfficeLine(models.Model):
    batch = models.ForeignKey(OfficeUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="office_lines")
    doc_no = models.CharField(max_length=40)
    txn_date = models.DateField()
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    pack_size = models.CharField(max_length=20, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    user_name = models.CharField(max_length=80, blank=True)
    txn_time = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "office_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "doc_no"]),
            models.Index(fields=["item_code"]),
        ]


class VerificationUploadBatch(models.Model):
    """Parent row for one 'Verifications Listing [Details]' XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="verification_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="verification_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_verification_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_verification/", null=True, blank=True)

    class Meta:
        db_table = "verification_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class VerificationLine(models.Model):
    batch = models.ForeignKey(VerificationUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="verification_lines")
    doc_no = models.CharField(max_length=40)
    txn_date = models.DateField()
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    pack_size = models.CharField(max_length=20, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    user_name = models.CharField(max_length=80, blank=True)
    txn_time = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "verification_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "doc_no"]),
            models.Index(fields=["item_code"]),
        ]


class GrnUploadBatch(models.Model):
    """Parent row for one 'Direct Goods Received Note Listing' XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="grn_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="grn_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_grn_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_grn/", null=True, blank=True)

    class Meta:
        db_table = "grn_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class GrnLine(models.Model):
    batch = models.ForeignKey(GrnUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="grn_lines")
    do_no = models.CharField(max_length=40)
    supplier_code = models.CharField(max_length=40, blank=True)
    invoice_no = models.CharField(max_length=40, blank=True)
    txn_date = models.DateField()
    txn_time = models.CharField(max_length=20, blank=True)
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    pack_size = models.CharField(max_length=20, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    packs = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    free_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    disc_pct = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    user_name = models.CharField(max_length=80, blank=True)
    tax_pct = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_reg = models.CharField(max_length=40, blank=True)

    class Meta:
        db_table = "grn_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "do_no"]),
            models.Index(fields=["item_code"]),
            models.Index(fields=["supplier_code"]),
        ]


class RtsUploadBatch(models.Model):
    """Parent row for one 'Returns to Supplier Listing' XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="rts_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="rts_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_rts_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_rts/", null=True, blank=True)

    class Meta:
        db_table = "rts_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class RtsLine(models.Model):
    batch = models.ForeignKey(RtsUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="rts_lines")
    do_no = models.CharField(max_length=40)
    supplier_code = models.CharField(max_length=40, blank=True)
    invoice_no = models.CharField(max_length=40, blank=True)
    txn_date = models.DateField()
    txn_time = models.CharField(max_length=20, blank=True)
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    pack_size = models.CharField(max_length=20, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    packs = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    free_qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    disc_pct = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    user_name = models.CharField(max_length=80, blank=True)
    tax_pct = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_reg = models.CharField(max_length=40, blank=True)

    class Meta:
        db_table = "rts_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "do_no"]),
            models.Index(fields=["item_code"]),
            models.Index(fields=["supplier_code"]),
        ]


class SalesUploadBatch(models.Model):
    """Parent row for one 'Bill Listing Details' Sales XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="sales_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="sales_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_sales_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_sales/", null=True, blank=True)

    class Meta:
        db_table = "sales_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class SalesLine(models.Model):
    """
    One sale-line row (an item within an invoice). Volume is the driver here:
    a mid-size outlet can log ~14k lines/month → 3k lines/week. Indexes are
    tuned for the two dominant reads: 'transactions for outlet on date' and
    'lookup by invoice'.
    """
    batch = models.ForeignKey(SalesUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="sales_lines")
    invoice_no = models.CharField(max_length=40)
    txn_date = models.DateField()
    txn_time = models.CharField(max_length=20, blank=True)
    item_code = models.CharField(max_length=40)
    description = models.CharField(max_length=255, blank=True)
    cust_code = models.CharField(max_length=40, blank=True)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cashier = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "sales_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "invoice_no"]),
            models.Index(fields=["item_code"]),
        ]


class SalesReturnUploadBatch(models.Model):
    """Parent row for one 'Sales Returns With Reasons' XLS upload."""
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        DELETED = "deleted", "Deleted"

    class ApprovalStatus(models.TextChoices):
        AUTO = "auto", "Auto"
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="sales_return_batches")
    date_from = models.DateField()
    date_to = models.DateField()
    uploaded_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, related_name="sales_return_batches")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    total_rows = models.IntegerField(default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    filename = models.CharField(max_length=255, blank=True)
    approval_status = models.CharField(max_length=10, choices=ApprovalStatus.choices, default=ApprovalStatus.AUTO)
    approved_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="approved_sales_return_batches")
    approved_at = models.DateTimeField(null=True, blank=True)
    stored_file = models.FileField(upload_to="pending_sales_returns/", null=True, blank=True)

    class Meta:
        db_table = "sales_return_upload_batches"
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["outlet", "date_from", "date_to"]),
            models.Index(fields=["approval_status"]),
        ]


class SalesReturnLine(models.Model):
    batch = models.ForeignKey(SalesReturnUploadBatch, on_delete=models.CASCADE, related_name="lines")
    outlet = models.ForeignKey("outlets.Outlet", on_delete=models.CASCADE, related_name="sales_return_lines")
    invoice_no = models.CharField(max_length=40)
    txn_date = models.DateField()
    txn_time = models.CharField(max_length=20, blank=True)
    item_code = models.CharField(max_length=40)
    barcode = models.CharField(max_length=40, blank=True)
    description = models.CharField(max_length=255, blank=True)
    member = models.CharField(max_length=60, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    gross_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    remarks = models.CharField(max_length=255, blank=True)
    user_name = models.CharField(max_length=80, blank=True)

    class Meta:
        db_table = "sales_return_lines"
        indexes = [
            models.Index(fields=["outlet", "txn_date"]),
            models.Index(fields=["outlet", "invoice_no"]),
            models.Index(fields=["item_code"]),
        ]


class Supplier(models.Model):
    """
    Master data for suppliers. The natural key is `code` — the short string
    (e.g. HINI0411) the POS system records in GRN / RTS exports. Detail rows
    (`grn_lines`, `rts_lines`) keep their `supplier_code` string column; this
    master table gives those codes a face (name, contact, payment terms).

    Backfilled on migration from distinct codes already seen in GRN + RTS
    lines so you can run scorecards immediately without manual data entry.
    """
    code = models.CharField(max_length=40, unique=True, db_index=True)
    name = models.CharField(max_length=200, blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    contact_email = models.CharField(max_length=255, blank=True)
    address = models.CharField(max_length=500, blank=True)
    tax_reg_no = models.CharField(max_length=60, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suppliers"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name or ''}".strip()


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
