"""
Backfill 87 foreign key constraints that were declared in models but never
created on the prod database. Prod was initially loaded from a schema dump
that omitted constraints; every migration since worked at the Django-ORM
level so the drift was invisible until now.

ON DELETE strategy (Path B — engineered, not literal-Django):
  - Business-owner FKs (NOT NULL): CASCADE. Deleting an outlet takes its
    items, snapshots, counts, etc. with it — that's the intended behavior.
  - Audit / support FKs (NULLABLE): SET NULL. Deleting a user preserves
    their historical uploads / counts / logins with a null author, rather
    than nuking years of business data. Same for optional supplier /
    category / upload_log refs.

The Django models still declare on_delete=CASCADE for the audit FKs; this
migration deliberately diverges from that. `makemigrations` won't try to
re-align — it only tracks fields, not on_delete post-hoc. If someone later
decides the models should say SET_NULL to match reality, that's a code
change with no schema impact.

Preflight verified zero orphan rows across all 87 FKs on 2026-07-16, so
adding these constraints is safe (no NOT VALID fallback needed).

Idempotent: each ADD CONSTRAINT is wrapped in a DO block that checks
pg_constraint first, so re-running is a no-op.
"""

from django.db import migrations


# (child_table, child_column, parent_table, ON DELETE action)
FKS_TO_ADD = [
    ("audit_logs", "user_id", "users", "SET NULL"),
    ("count_sessions", "closed_by_id", "users", "SET NULL"),
    ("count_sessions", "outlet_id", "outlets", "CASCADE"),
    ("count_sessions", "started_by_id", "users", "SET NULL"),
    ("damage_lines", "batch_id", "damage_upload_batches", "CASCADE"),
    ("damage_lines", "outlet_id", "outlets", "CASCADE"),
    ("damage_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("damage_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("damage_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("grn_lines", "batch_id", "grn_upload_batches", "CASCADE"),
    ("grn_lines", "outlet_id", "outlets", "CASCADE"),
    ("grn_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("grn_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("grn_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("item_barcodes", "assigned_by_id", "users", "SET NULL"),
    ("item_barcodes", "item_id", "items", "CASCADE"),
    ("item_barcodes", "outlet_id", "outlets", "CASCADE"),
    ("item_price_history", "changed_by_id", "users", "SET NULL"),
    ("item_price_history", "item_id", "items", "CASCADE"),
    ("item_price_history", "outlet_id", "outlets", "CASCADE"),
    ("items", "barcode_assigned_by_id", "users", "SET NULL"),
    ("items", "category_ref_id", "item_categories", "SET NULL"),
    ("items", "outlet_id", "outlets", "CASCADE"),
    ("items", "upload_log_id", "upload_logs", "SET NULL"),
    ("login_events", "user_id", "users", "SET NULL"),
    ("mobile_devices", "last_outlet_id", "outlets", "SET NULL"),
    ("mobile_devices", "last_user_id", "users", "SET NULL"),
    ("office_lines", "batch_id", "office_upload_batches", "CASCADE"),
    ("office_lines", "outlet_id", "outlets", "CASCADE"),
    ("office_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("office_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("office_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("org_demand_snapshots", "master_product_id", "org_master_products", "CASCADE"),
    ("org_demand_snapshots", "outlet_id", "outlets", "CASCADE"),
    ("org_item_master_links", "linked_by_id", "users", "SET NULL"),
    ("org_item_master_links", "master_product_id", "org_master_products", "CASCADE"),
    ("org_master_products", "category_id", "item_categories", "SET NULL"),
    ("org_master_products", "default_supplier_id", "suppliers", "SET NULL"),
    ("org_purchase_plan_lines", "master_product_id", "org_master_products", "CASCADE"),
    ("org_purchase_plan_lines", "outlet_id", "outlets", "SET NULL"),
    ("org_purchase_plan_lines", "plan_id", "org_purchase_plans", "CASCADE"),
    ("org_purchase_plans", "approved_by_id", "users", "SET NULL"),
    ("org_purchase_plans", "created_by_id", "users", "SET NULL"),
    ("org_purchase_plans", "supplier_id", "suppliers", "SET NULL"),
    ("pending_items", "first_seen_outlet_id", "outlets", "CASCADE"),
    ("pending_items", "item_id", "items", "SET NULL"),
    ("pending_items", "upload_log_id", "upload_logs", "SET NULL"),
    ("pos_snapshots", "item_id", "items", "CASCADE"),
    ("pos_snapshots", "outlet_id", "outlets", "CASCADE"),
    ("pos_snapshots", "uploaded_by_id", "users", "SET NULL"),
    ("rts_lines", "batch_id", "rts_upload_batches", "CASCADE"),
    ("rts_lines", "outlet_id", "outlets", "CASCADE"),
    ("rts_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("rts_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("rts_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("sales_lines", "batch_id", "sales_upload_batches", "CASCADE"),
    ("sales_lines", "outlet_id", "outlets", "CASCADE"),
    ("sales_return_lines", "batch_id", "sales_return_upload_batches", "CASCADE"),
    ("sales_return_lines", "outlet_id", "outlets", "CASCADE"),
    ("sales_return_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("sales_return_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("sales_return_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("sales_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("sales_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("sales_upload_batches", "uploaded_by_id", "users", "SET NULL"),
    ("stock_age_snapshots", "item_id", "items", "CASCADE"),
    ("stock_age_snapshots", "master_product_id", "org_master_products", "SET NULL"),
    ("stock_age_snapshots", "outlet_id", "outlets", "CASCADE"),
    ("stock_counts", "approved_by_id", "users", "SET NULL"),
    ("stock_counts", "counted_by_id", "users", "SET NULL"),
    ("stock_counts", "item_id", "items", "CASCADE"),
    ("stock_counts", "outlet_id", "outlets", "CASCADE"),
    ("stock_movements", "created_by_id", "users", "SET NULL"),
    ("stock_movements", "item_id", "items", "CASCADE"),
    ("stock_movements", "outlet_id", "outlets", "CASCADE"),
    ("upload_logs", "approved_by_id", "users", "SET NULL"),
    ("upload_logs", "outlet_id", "outlets", "CASCADE"),
    ("upload_logs", "uploaded_by_id", "users", "SET NULL"),
    ("users", "outlet_id", "outlets", "SET NULL"),
    ("variance_records", "item_id", "items", "CASCADE"),
    ("variance_records", "outlet_id", "outlets", "CASCADE"),
    ("variance_records", "resolved_by_id", "users", "SET NULL"),
    ("verification_lines", "batch_id", "verification_upload_batches", "CASCADE"),
    ("verification_lines", "outlet_id", "outlets", "CASCADE"),
    ("verification_upload_batches", "approved_by_id", "users", "SET NULL"),
    ("verification_upload_batches", "outlet_id", "outlets", "CASCADE"),
    ("verification_upload_batches", "uploaded_by_id", "users", "SET NULL"),
]


def _fk_name(table, column):
    # Django-style short name. Unique per (table, column) — enough for
    # our idempotency check because pg_constraint is scoped per table.
    return f"{table}_{column}_fk_backfill"


def _forward_sql():
    parts = []
    for table, col, ref, on_del in FKS_TO_ADD:
        cname = _fk_name(table, col)
        parts.append(f"""
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = '{table}'::regclass
              AND contype = 'f'
              AND array_position(conkey, (
                  SELECT attnum FROM pg_attribute
                  WHERE attrelid = '{table}'::regclass AND attname = '{col}'
              )) IS NOT NULL
        ) THEN
            EXECUTE 'ALTER TABLE public.{table}
                     ADD CONSTRAINT {cname}
                     FOREIGN KEY ({col}) REFERENCES public.{ref}(id)
                     ON DELETE {on_del}
                     DEFERRABLE INITIALLY DEFERRED';
        END IF;
        """)
    body = "\n".join(parts)
    return f"""
    DO $$
    BEGIN
        {body}
    END$$;
    """


def _reverse_sql():
    parts = []
    for table, col, _ref, _on in FKS_TO_ADD:
        cname = _fk_name(table, col)
        parts.append(f"ALTER TABLE public.{table} DROP CONSTRAINT IF EXISTS {cname};")
    return "\n".join(parts)


class Migration(migrations.Migration):
    dependencies = [
        ("uploads", "0018_drop_inventory_tables"),
    ]

    operations = [
        migrations.RunSQL(
            sql=_forward_sql(),
            reverse_sql=_reverse_sql(),
        ),
    ]
