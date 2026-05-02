from django.apps import AppConfig


class CatalogExtConfig(AppConfig):
    """
    Phase 1 — catalog enrichment.

    Adds product-level metadata (images, long description, SEO, price lists)
    on top of the existing Item master without modifying the Item table.
    Every new table FK's to Item; deleting an Item cascades. Existing POS /
    Stock flows are not affected.
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.catalog_ext"
    label = "catalog_ext"
