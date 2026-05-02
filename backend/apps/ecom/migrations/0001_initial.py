"""
Phase 2 — ecommerce schema. Five new tables, all FK'd to existing apps.
Existing tables are not modified.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("outlets", "0001_initial"),
        ("items", "0001_initial"),
        ("pos", "0001_initial"),
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EcomAddress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("label", models.CharField(blank=True, default="", max_length=40)),
                ("recipient_name", models.CharField(max_length=120)),
                ("phone", models.CharField(blank=True, default="", max_length=40)),
                ("line1", models.CharField(max_length=200)),
                ("line2", models.CharField(blank=True, default="", max_length=200)),
                ("city", models.CharField(max_length=80)),
                ("postal_code", models.CharField(blank=True, default="", max_length=20)),
                ("country", models.CharField(default="LK", max_length=2)),
                ("is_default", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="ecom_addresses", to="pos.customer")),
            ],
            options={"db_table": "ecom_addresses", "ordering": ["-is_default", "-updated_at"]},
        ),
        migrations.AddIndex(
            model_name="ecomaddress",
            index=models.Index(fields=["customer", "is_default"], name="ecom_addr_cust_def_idx"),
        ),
        migrations.CreateModel(
            name="EcomCart",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("session_token", models.CharField(db_index=True, max_length=64, unique=True)),
                ("status", models.CharField(default="active", max_length=12, choices=[
                    ("active", "Active"), ("converted", "Converted to Order"),
                    ("abandoned", "Abandoned"), ("expired", "Expired"),
                ])),
                ("last_activity_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("customer", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="ecom_carts", to="pos.customer")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="ecom_carts", to="outlets.outlet")),
            ],
            options={"db_table": "ecom_carts", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="ecomcart",
            index=models.Index(fields=["status", "last_activity_at"], name="ecom_cart_stat_act_idx"),
        ),
        migrations.AddIndex(
            model_name="ecomcart",
            index=models.Index(fields=["customer", "status"], name="ecom_cart_cust_stat_idx"),
        ),
        migrations.CreateModel(
            name="EcomCartItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("unit_price_snapshot", models.DecimalField(decimal_places=2, max_digits=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("cart", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="items", to="ecom.ecomcart")),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="ecom_cart_items", to="items.item")),
                ("reservation", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="cart_items", to="inventory.stockreservation")),
            ],
            options={"db_table": "ecom_cart_items"},
        ),
        migrations.AddConstraint(
            model_name="ecomcartitem",
            constraint=models.UniqueConstraint(fields=["cart", "item"], name="uniq_cart_item"),
        ),
        migrations.AddIndex(
            model_name="ecomcartitem",
            index=models.Index(fields=["cart"], name="ecom_cart_item_cart_idx"),
        ),
        migrations.CreateModel(
            name="EcomOrder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("number", models.CharField(db_index=True, max_length=32, unique=True)),
                ("guest_name", models.CharField(blank=True, default="", max_length=120)),
                ("guest_email", models.CharField(blank=True, default="", max_length=255)),
                ("guest_phone", models.CharField(blank=True, default="", max_length=40)),
                ("status", models.CharField(default="pending_payment", db_index=True, max_length=20, choices=[
                    ("pending_payment", "Pending Payment"), ("paid", "Paid"),
                    ("fulfilling", "Fulfilling"), ("shipped", "Shipped"),
                    ("delivered", "Delivered"), ("cancelled", "Cancelled"),
                    ("refunded", "Refunded"),
                ])),
                ("shipping_address", models.JSONField(blank=True, default=dict)),
                ("billing_address", models.JSONField(blank=True, default=dict)),
                ("subtotal", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("shipping_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("tax_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("discount_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("grand_total", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("currency", models.CharField(default="LKR", max_length=8)),
                ("payment_intent_ref", models.CharField(blank=True, default="", max_length=120)),
                ("notes", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("fulfilled_at", models.DateTimeField(blank=True, null=True)),
                ("shipped_at", models.DateTimeField(blank=True, null=True)),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                ("cart", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="orders", to="ecom.ecomcart")),
                ("customer", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="ecom_orders", to="pos.customer")),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="ecom_orders", to="outlets.outlet")),
                ("payment", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="ecom_orders", to="pos.payment")),
            ],
            options={"db_table": "ecom_orders", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="ecomorder",
            index=models.Index(fields=["outlet", "status"], name="ecom_order_outl_stat_idx"),
        ),
        migrations.AddIndex(
            model_name="ecomorder",
            index=models.Index(fields=["customer", "-created_at"], name="ecom_order_cust_dt_idx"),
        ),
        migrations.AddIndex(
            model_name="ecomorder",
            index=models.Index(fields=["status", "-created_at"], name="ecom_order_stat_dt_idx"),
        ),
        migrations.CreateModel(
            name="EcomOrderLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("item_code_snapshot", models.CharField(max_length=50)),
                ("item_name_snapshot", models.CharField(max_length=300)),
                ("qty", models.DecimalField(decimal_places=3, max_digits=12)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("line_subtotal", models.DecimalField(decimal_places=2, max_digits=14)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=14)),
                ("is_committed", models.BooleanField(default=False)),
                ("committed_at", models.DateTimeField(blank=True, null=True)),
                ("item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                    related_name="ecom_order_lines", to="items.item")),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="lines", to="ecom.ecomorder")),
                ("reservation", models.ForeignKey(blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="order_lines", to="inventory.stockreservation")),
            ],
            options={"db_table": "ecom_order_lines"},
        ),
        migrations.AddIndex(
            model_name="ecomorderline",
            index=models.Index(fields=["order"], name="ecom_ol_order_idx"),
        ),
        migrations.AddIndex(
            model_name="ecomorderline",
            index=models.Index(fields=["item"], name="ecom_ol_item_idx"),
        ),
        migrations.AddIndex(
            model_name="ecomorderline",
            index=models.Index(fields=["is_committed"], name="ecom_ol_committed_idx"),
        ),
    ]
