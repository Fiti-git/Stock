from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("uploads", "0008_rename_damg_line_outlet_date_idx_damage_line_outlet__125696_idx_and_more"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="possnapshot",
            index=models.Index(fields=["outlet", "snapshot_date"], name="pos_snap_outlet_date_idx"),
        ),
        migrations.AddIndex(
            model_name="possnapshot",
            index=models.Index(fields=["outlet", "snapshot_date", "pos_quantity"], name="pos_snap_outlet_date_qty_idx"),
        ),
        migrations.AddIndex(
            model_name="possnapshot",
            index=models.Index(fields=["item", "-snapshot_date"], name="pos_snap_item_date_idx"),
        ),
    ]
