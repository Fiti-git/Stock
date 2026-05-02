"""
Phase 1 — catalog enrichment schema. Purely additive: four new tables FK'd
to existing apps.items.Item. Existing tables are not modified.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("items", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProductDescription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("slug", models.SlugField(db_index=True, max_length=200)),
                ("short_description", models.CharField(blank=True, default="", max_length=300)),
                ("long_description", models.TextField(blank=True, default="")),
                ("seo_title", models.CharField(blank=True, default="", max_length=200)),
                ("seo_description", models.CharField(blank=True, default="", max_length=400)),
                ("is_published", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="catalog_descriptions", to="items.item")),
            ],
            options={"db_table": "catalog_product_descriptions"},
        ),
        migrations.AddConstraint(
            model_name="productdescription",
            constraint=models.UniqueConstraint(fields=["item"], name="uniq_desc_per_item"),
        ),
        migrations.AddIndex(
            model_name="productdescription",
            index=models.Index(fields=["slug"], name="cat_desc_slug_idx"),
        ),
        migrations.AddIndex(
            model_name="productdescription",
            index=models.Index(fields=["is_published"], name="cat_desc_pub_idx"),
        ),
        migrations.CreateModel(
            name="ProductImage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("image", models.ImageField(upload_to="catalog/images/%Y/%m/")),
                ("alt_text", models.CharField(blank=True, default="", max_length=200)),
                ("sort_order", models.PositiveIntegerField(db_index=True, default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="catalog_images", to="items.item")),
            ],
            options={"db_table": "catalog_product_images", "ordering": ["sort_order", "id"]},
        ),
        migrations.AddIndex(
            model_name="productimage",
            index=models.Index(fields=["item", "sort_order"], name="cat_img_item_sort_idx"),
        ),
        migrations.CreateModel(
            name="PriceList",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=40, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("currency", models.CharField(default="LKR", max_length=8)),
                ("priority", models.IntegerField(db_index=True, default=100)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("starts_at", models.DateTimeField(blank=True, null=True)),
                ("ends_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "catalog_price_lists", "ordering": ["priority", "id"]},
        ),
        migrations.CreateModel(
            name="PriceListItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("compare_at_price", models.DecimalField(blank=True, decimal_places=2,
                    max_digits=12, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="price_list_items", to="items.item")),
                ("price_list", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="items", to="catalog_ext.pricelist")),
            ],
            options={"db_table": "catalog_price_list_items"},
        ),
        migrations.AddConstraint(
            model_name="pricelistitem",
            constraint=models.UniqueConstraint(
                fields=["price_list", "item"], name="uniq_price_per_list_item",
            ),
        ),
        migrations.AddIndex(
            model_name="pricelistitem",
            index=models.Index(fields=["item", "is_active"], name="cat_pli_item_act_idx"),
        ),
        migrations.AddIndex(
            model_name="pricelistitem",
            index=models.Index(fields=["price_list", "is_active"], name="cat_pli_list_act_idx"),
        ),
    ]
