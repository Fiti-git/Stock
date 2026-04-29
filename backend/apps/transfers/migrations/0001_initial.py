from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
        ("items", "0001_initial"),
        ("outlets", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StockTransfer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ref_no", models.CharField(max_length=40, unique=True)),
                ("status", models.CharField(
                    max_length=20, default="draft",
                    choices=[
                        ("draft", "Draft"),
                        ("requested", "Requested"),
                        ("dispatched", "Dispatched"),
                        ("received", "Received"),
                        ("variance_review", "Variance Review"),
                        ("closed", "Closed"),
                        ("cancelled", "Cancelled"),
                    ],
                )),
                ("requested_at", models.DateTimeField(blank=True, null=True)),
                ("dispatched_at", models.DateTimeField(blank=True, null=True)),
                ("received_at", models.DateTimeField(blank=True, null=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("variance_note", models.CharField(blank=True, default="", max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("source_outlet", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="transfers_out", to="outlets.outlet",
                )),
                ("dest_outlet", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="transfers_in", to="outlets.outlet",
                )),
                ("requested_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="requested_transfers",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("dispatched_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="dispatched_transfers",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("received_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="received_transfers",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("closed_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="closed_transfers",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="created_transfers",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "stock_transfers", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="stocktransfer",
            index=models.Index(fields=["source_outlet", "status"], name="stk_tr_src_status_idx"),
        ),
        migrations.AddIndex(
            model_name="stocktransfer",
            index=models.Index(fields=["dest_outlet", "status"], name="stk_tr_dst_status_idx"),
        ),
        migrations.AddIndex(
            model_name="stocktransfer",
            index=models.Index(fields=["-created_at"], name="stk_tr_created_idx"),
        ),
        migrations.CreateModel(
            name="StockTransferLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_code", models.CharField(max_length=50)),
                ("item_name", models.CharField(max_length=300)),
                ("qty_requested", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("qty_dispatched", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("qty_received", models.DecimalField(decimal_places=3, default=0, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("batches_dispatched", models.JSONField(blank=True, default=list)),
                ("note", models.CharField(blank=True, default="", max_length=200)),
                ("transfer", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="lines", to="transfers.stocktransfer",
                )),
                ("item", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="transfer_lines", to="items.item",
                )),
            ],
            options={"db_table": "stock_transfer_lines"},
        ),
        migrations.AddIndex(
            model_name="stocktransferline",
            index=models.Index(fields=["transfer"], name="stk_tr_line_transfer_idx"),
        ),
        migrations.AddIndex(
            model_name="stocktransferline",
            index=models.Index(fields=["item"], name="stk_tr_line_item_idx"),
        ),
        migrations.CreateModel(
            name="TransferEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("from_status", models.CharField(blank=True, default="", max_length=20)),
                ("to_status", models.CharField(max_length=20)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("transfer", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="events", to="transfers.stocktransfer",
                )),
                ("actor", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="transfer_events",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "stock_transfer_events", "ordering": ["created_at"]},
        ),
        migrations.AddIndex(
            model_name="transferevent",
            index=models.Index(fields=["transfer", "created_at"], name="stk_tr_evt_transfer_idx"),
        ),
    ]
