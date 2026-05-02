"""
Catalog enrichment models — used by the storefront. Every row FK's to an
existing apps.items.Item; the Item table itself is not modified.

Design rules:
  1. Additive only. POS and Stock flows never read these tables.
  2. Soft-publish via `is_published` so admins can stage products before
     they appear on the storefront.
  3. SEO slug is unique per outlet — multi-outlet shops can list the same
     SKU at different outlets with the same slug.
"""
from django.db import models


class ProductDescription(models.Model):
    """
    Long-form copy + SEO metadata for an Item. One row per item per outlet
    (so different outlets can run different copy / pricing / availability).
    """
    item = models.ForeignKey(
        "items.Item", on_delete=models.CASCADE,
        related_name="catalog_descriptions",
    )
    slug = models.SlugField(max_length=200, db_index=True)
    short_description = models.CharField(max_length=300, blank=True, default="")
    long_description = models.TextField(blank=True, default="")
    seo_title = models.CharField(max_length=200, blank=True, default="")
    seo_description = models.CharField(max_length=400, blank=True, default="")
    is_published = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_product_descriptions"
        constraints = [
            models.UniqueConstraint(fields=["item"], name="uniq_desc_per_item"),
        ]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["is_published"]),
        ]

    def __str__(self):
        return f"Desc({self.item_id}, {self.slug})"


class ProductImage(models.Model):
    """
    Image gallery for an Item. Multiple per item; `sort_order` controls
    gallery order. The first row is the cover.

    Storage uses Django's MEDIA_ROOT in dev; switch DEFAULT_FILE_STORAGE to
    django-storages S3 in prod with a single env var change.
    """
    item = models.ForeignKey(
        "items.Item", on_delete=models.CASCADE,
        related_name="catalog_images",
    )
    image = models.ImageField(upload_to="catalog/images/%Y/%m/")
    alt_text = models.CharField(max_length=200, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "catalog_product_images"
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["item", "sort_order"]),
        ]

    def __str__(self):
        return f"Image({self.item_id}, {self.sort_order})"


class PriceList(models.Model):
    """
    Named price list (e.g. "Online Retail", "Member", "Bulk B2B"). The
    storefront resolves a price for an Item by walking active lists in
    priority order; the first match wins. POS continues to use the legacy
    selling_price on Item — this layer is purely for ecom.
    """
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    currency = models.CharField(max_length=8, default="LKR")
    priority = models.IntegerField(default=100, db_index=True,
                                   help_text="Lower = higher priority.")
    is_active = models.BooleanField(default=True, db_index=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_price_lists"
        ordering = ["priority", "id"]

    def __str__(self):
        return f"{self.code} ({self.name})"


class PriceListItem(models.Model):
    """One Item's price within one PriceList."""
    price_list = models.ForeignKey(
        PriceList, on_delete=models.CASCADE, related_name="items",
    )
    item = models.ForeignKey(
        "items.Item", on_delete=models.CASCADE,
        related_name="price_list_items",
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    compare_at_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Strike-through 'was' price.",
    )
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalog_price_list_items"
        constraints = [
            models.UniqueConstraint(
                fields=["price_list", "item"],
                name="uniq_price_per_list_item",
            ),
        ]
        indexes = [
            models.Index(fields=["item", "is_active"]),
            models.Index(fields=["price_list", "is_active"]),
        ]

    def __str__(self):
        return f"{self.price_list.code}/{self.item_id} = {self.unit_price}"
