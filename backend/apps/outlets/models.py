from django.db import models


class Outlet(models.Model):
    outlet_name = models.CharField(max_length=200, unique=True)
    short_code = models.CharField(max_length=20, blank=True, default="")
    location_code = models.CharField(max_length=20, blank=True)
    file_location_name = models.CharField(
        max_length=200, blank=True, default="",
        help_text="Name as it appears in the POS XLS file header (e.g. AMPITIYA). Used for upload matching."
    )

    # Receipt header / customer-facing info
    address = models.CharField(max_length=500, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    tax_reg_no = models.CharField(max_length=60, blank=True, default="")
    receipt_footer = models.CharField(max_length=500, blank=True, default="Thank you for shopping with us!")
    logo = models.ImageField(upload_to="outlet_logos/", blank=True, null=True)

    # LankaQR static merchant QR (upload merchant QR PNG once, shown on LankaQR tender)
    lankaqr_merchant_id = models.CharField(max_length=60, blank=True, default="")
    lankaqr_merchant_name = models.CharField(max_length=120, blank=True, default="")
    lankaqr_static_qr = models.ImageField(upload_to="outlet_lankaqr/", blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        db_table = "outlets"
        ordering = ["outlet_name"]

    def __str__(self):
        return self.outlet_name
