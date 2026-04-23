from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("outlets", "0003_outlet_file_location_name"),
    ]

    operations = [
        migrations.AddField(model_name="outlet", name="address", field=models.CharField(blank=True, default="", max_length=500)),
        migrations.AddField(model_name="outlet", name="phone", field=models.CharField(blank=True, default="", max_length=40)),
        migrations.AddField(model_name="outlet", name="tax_reg_no", field=models.CharField(blank=True, default="", max_length=60)),
        migrations.AddField(model_name="outlet", name="receipt_footer", field=models.CharField(blank=True, default="Thank you for shopping with us!", max_length=500)),
        migrations.AddField(model_name="outlet", name="logo", field=models.ImageField(blank=True, null=True, upload_to="outlet_logos/")),
        migrations.AddField(model_name="outlet", name="lankaqr_merchant_id", field=models.CharField(blank=True, default="", max_length=60)),
        migrations.AddField(model_name="outlet", name="lankaqr_merchant_name", field=models.CharField(blank=True, default="", max_length=120)),
        migrations.AddField(model_name="outlet", name="lankaqr_static_qr", field=models.ImageField(blank=True, null=True, upload_to="outlet_lankaqr/")),
        migrations.AddField(model_name="outlet", name="updated_at", field=models.DateTimeField(auto_now=True, null=True)),
    ]
