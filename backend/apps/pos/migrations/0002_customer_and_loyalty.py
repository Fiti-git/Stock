from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0001_initial"),
        ("pos", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Customer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("phone", models.CharField(blank=True, default="", max_length=40)),
                ("email", models.CharField(blank=True, default="", max_length=255)),
                ("address", models.CharField(blank=True, default="", max_length=500)),
                ("loyalty_points", models.IntegerField(default=0)),
                ("credit_balance", models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("outlet", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="customers", to="outlets.outlet")),
            ],
            options={"db_table": "pos_customers", "ordering": ["name"]},
        ),
        migrations.AddIndex(model_name="customer", index=models.Index(fields=["outlet", "phone"], name="cust_outlet_phone_idx")),
        migrations.AddIndex(model_name="customer", index=models.Index(fields=["outlet", "name"], name="cust_outlet_name_idx")),
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.UniqueConstraint(
                fields=["outlet", "phone"],
                condition=~models.Q(phone=""),
                name="uniq_customer_phone_per_outlet",
            ),
        ),

        migrations.AddField(
            model_name="bill", name="customer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="bills", to="pos.customer"),
        ),
        migrations.AddField(model_name="bill", name="loyalty_points_earned", field=models.IntegerField(default=0)),
        migrations.AddField(model_name="bill", name="loyalty_points_redeemed", field=models.IntegerField(default=0)),
    ]
