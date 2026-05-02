"""
Storefront serializers. These read from existing Item + new catalog_ext
tables and shape a customer-friendly product payload.
"""
from rest_framework import serializers

from apps.items.models import Item

from .models import ProductDescription, ProductImage, PriceList, PriceListItem


class ProductImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ("id", "url", "alt_text", "sort_order")

    def get_url(self, obj):
        request = self.context.get("request")
        try:
            url = obj.image.url
        except Exception:
            return None
        return request.build_absolute_uri(url) if request else url


class ProductCardSerializer(serializers.ModelSerializer):
    """Lightweight payload for listing pages."""
    slug = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = (
            "id", "item_code", "item_name", "category",
            "slug", "cover_image", "price",
        )

    def get_slug(self, obj):
        desc = self.context.get("desc_by_item", {}).get(obj.id)
        return desc.slug if desc else ""

    def get_cover_image(self, obj):
        imgs = self.context.get("images_by_item", {}).get(obj.id) or []
        if not imgs:
            return None
        return ProductImageSerializer(imgs[0], context=self.context).data

    def get_price(self, obj):
        return self.context.get("price_by_item", {}).get(obj.id)


class ProductDetailSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source="catalog_descriptions.slug", read_only=True, default="")
    short_description = serializers.SerializerMethodField()
    long_description = serializers.SerializerMethodField()
    seo_title = serializers.SerializerMethodField()
    seo_description = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()
    compare_at_price = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = (
            "id", "item_code", "item_name", "category", "barcode",
            "slug", "short_description", "long_description",
            "seo_title", "seo_description",
            "images", "price", "compare_at_price", "currency",
        )

    def _desc(self, obj):
        return obj.catalog_descriptions.first()

    def get_short_description(self, obj):
        d = self._desc(obj)
        return d.short_description if d else ""

    def get_long_description(self, obj):
        d = self._desc(obj)
        return d.long_description if d else ""

    def get_seo_title(self, obj):
        d = self._desc(obj)
        return (d.seo_title if d else "") or obj.item_name

    def get_seo_description(self, obj):
        d = self._desc(obj)
        return (d.seo_description if d else "") or ""

    def get_images(self, obj):
        qs = obj.catalog_images.filter(is_active=True).order_by("sort_order", "id")
        return ProductImageSerializer(qs, many=True, context=self.context).data

    def _resolved(self, obj):
        return self.context.get("price_resolution", {}).get(obj.id) or {}

    def get_price(self, obj):
        return self._resolved(obj).get("unit_price")

    def get_compare_at_price(self, obj):
        return self._resolved(obj).get("compare_at_price")

    def get_currency(self, obj):
        return self._resolved(obj).get("currency", "LKR")
