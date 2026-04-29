"""Phase 2 Agent 7 — extend Promotion (BOGO/COMBO/TIERED/HAPPY_HOUR), add Coupon, CouponRedemption, GiftCard, GiftCardTxn, and gift_card tender."""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0010_billline_unit_kind"),
        ("outlets", "0001_initial"),
        ("items", "0022_seed_more_units"),
        ("accounts", "0007_user_manager_pin_hash"),
    ]

    operations = [
        # ---- Promotion extensions ----
        migrations.AlterField(
            model_name="promotion",
            name="kind",
            field=models.CharField(
                choices=[
                    ("percent", "% off"),
                    ("amount", "LKR off"),
                    ("bogo", "Buy X Get Y"),
                    ("combo", "Combo bundle"),
                    ("tiered", "Tiered discount"),
                    ("happy_hour", "Happy hour"),
                ],
                max_length=15,
            ),
        ),
        migrations.AddField(
            model_name="promotion",
            name="buy_qty",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="promotion",
            name="get_qty",
            field=models.DecimalField(decimal_places=3, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="promotion",
            name="get_item",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="items.item",
            ),
        ),
        migrations.AddField(
            model_name="promotion",
            name="combo_items",
            field=models.ManyToManyField(blank=True, related_name="combo_promotions", to="items.item"),
        ),
        migrations.AddField(
            model_name="promotion",
            name="combo_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AddField(
            model_name="promotion",
            name="tiers",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="promotion",
            name="time_from",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="promotion",
            name="time_to",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="promotion",
            name="weekdays",
            field=models.CharField(blank=True, default="", max_length=15),
        ),

        # ---- Coupon ----
        migrations.CreateModel(
            name="Coupon",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("code", models.CharField(db_index=True, max_length=40, unique=True)),
                ("discount_kind", models.CharField(
                    choices=[("percent", "% off"), ("amount", "LKR off")], max_length=10)),
                ("value", models.DecimalField(decimal_places=2, max_digits=14)),
                ("min_bill_amount", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("one_time", models.BooleanField(default=False)),
                ("per_customer_limit", models.IntegerField(default=0)),
                ("usage_count", models.IntegerField(default=0)),
                ("max_usage", models.IntegerField(default=0)),
                ("starts_at", models.DateTimeField(blank=True, null=True)),
                ("ends_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="created_coupons", to="accounts.user")),
                ("outlet", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="coupons", to="outlets.outlet")),
            ],
            options={
                "db_table": "pos_coupons",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="coupon",
            index=models.Index(fields=["outlet", "is_active"], name="pos_coupons_outlet__act_idx"),
        ),
        migrations.AddIndex(
            model_name="coupon",
            index=models.Index(fields=["code"], name="pos_coupons_code_idx"),
        ),

        # ---- CouponRedemption ----
        migrations.CreateModel(
            name="CouponRedemption",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("discount_applied", models.DecimalField(decimal_places=2, max_digits=14)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("bill", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="coupon_redemptions", to="pos.bill")),
                ("coupon", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="redemptions", to="pos.coupon")),
                ("customer", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="coupon_redemptions", to="pos.customer")),
            ],
            options={
                "db_table": "pos_coupon_redemptions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="couponredemption",
            index=models.Index(fields=["coupon", "-created_at"], name="pos_couponred_coupon_idx"),
        ),
        migrations.AddIndex(
            model_name="couponredemption",
            index=models.Index(fields=["customer"], name="pos_couponred_customer_idx"),
        ),

        # ---- GiftCard ----
        migrations.CreateModel(
            name="GiftCard",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("serial", models.CharField(db_index=True, max_length=40, unique=True)),
                ("initial_balance", models.DecimalField(decimal_places=2, max_digits=14)),
                ("current_balance", models.DecimalField(decimal_places=2, max_digits=14)),
                ("expires_at", models.DateField(blank=True, null=True)),
                ("status", models.CharField(
                    choices=[("active", "Active"), ("redeemed", "Redeemed"),
                             ("expired", "Expired"), ("void", "Void")],
                    default="active", max_length=10)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("customer", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="gift_cards", to="pos.customer")),
                ("issued_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="issued_gift_cards", to="accounts.user")),
                ("outlet", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="gift_cards", to="outlets.outlet")),
            ],
            options={
                "db_table": "pos_gift_cards",
                "ordering": ["-issued_at"],
            },
        ),
        migrations.AddIndex(
            model_name="giftcard",
            index=models.Index(fields=["outlet", "status"], name="pos_giftcards_outlet_idx"),
        ),
        migrations.AddIndex(
            model_name="giftcard",
            index=models.Index(fields=["serial"], name="pos_giftcards_serial_idx"),
        ),

        # ---- GiftCardTxn ----
        migrations.CreateModel(
            name="GiftCardTxn",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14)),
                ("balance_after", models.DecimalField(decimal_places=2, max_digits=14)),
                ("kind", models.CharField(
                    choices=[("issue", "Issue"), ("redeem", "Redeem"),
                             ("adjust", "Adjust"), ("void", "Void")],
                    max_length=10)),
                ("note", models.CharField(blank=True, default="", max_length=300)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("bill", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="gift_card_txns", to="pos.bill")),
                ("card", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="txns", to="pos.giftcard")),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="gift_card_txns", to="accounts.user")),
            ],
            options={
                "db_table": "pos_gift_card_txns",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="giftcardtxn",
            index=models.Index(fields=["card", "-created_at"], name="pos_gctxn_card_idx"),
        ),

        # ---- Payment.tender — add gift_card ----
        migrations.AlterField(
            model_name="payment",
            name="tender",
            field=models.CharField(
                choices=[
                    ("cash", "Cash"),
                    ("card", "Card"),
                    ("lankaqr", "LankaQR"),
                    ("bank", "Bank Transfer"),
                    ("credit", "Store Credit"),
                    ("other", "Other"),
                    ("gift_card", "Gift Card"),
                ],
                max_length=15,
            ),
        ),
    ]
