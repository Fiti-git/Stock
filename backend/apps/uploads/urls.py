from django.urls import path
from .views import (
    validate_upload,
    confirm_upload,
    upload_history,
    pending_approvals,
    approve_upload,
    reject_upload,
    delete_upload,
    deletion_preview,
    all_outlets_overview,
    audit_log_list,
    upload_diff,
    orphan_list,
    orphan_purge,
    orphan_purge_all,
)
from .views_damage import (
    damage_validate, damage_confirm, damage_batches, damage_batch_detail,
    damage_approve, damage_reject, damage_delete, damage_deletion_preview,
    damage_overview, damage_stats,
)
from .views_office import (
    office_validate, office_confirm, office_batches, office_batch_detail,
    office_approve, office_reject, office_delete, office_deletion_preview,
    office_overview, office_stats,
)
from .views_verification import (
    verification_validate, verification_confirm, verification_batches,
    verification_batch_detail, verification_approve, verification_reject,
    verification_delete, verification_deletion_preview, verification_overview,
    verification_stats,
)
from .views_grn import (
    grn_validate, grn_confirm, grn_batches, grn_batch_detail,
    grn_approve, grn_reject, grn_delete, grn_deletion_preview, grn_overview,
    grn_stats,
)
from .views_rts import (
    rts_validate, rts_confirm, rts_batches, rts_batch_detail,
    rts_approve, rts_reject, rts_delete, rts_deletion_preview, rts_overview,
    rts_stats,
)
from .views_sales import (
    sales_validate, sales_confirm, sales_batches, sales_batch_detail,
    sales_approve, sales_reject, sales_delete, sales_deletion_preview,
    sales_overview, sales_stats,
)
from .views_sales_returns import (
    sales_returns_validate, sales_returns_confirm, sales_returns_batches,
    sales_returns_batch_detail, sales_returns_approve, sales_returns_reject,
    sales_returns_delete, sales_returns_deletion_preview,
    sales_returns_overview, sales_returns_stats,
)
from .views_operations import operations_today
from .views_reports import daily_sales, item_rankings, wastage_summary
from .views_anomalies import anomalies
from .views_suppliers import (
    supplier_list_create, supplier_detail,
    supplier_scorecard, supplier_detail_scorecard,
)
from .views_uploaded_sheets import (
    uploaded_sheets_list, uploaded_sheet_detail,
    uploaded_sheet_delete, uploaded_sheet_bulk_delete,
    uploaded_sheets_coverage,
)

urlpatterns = [
    # POS snapshot pipeline (existing)
    path("validate/", validate_upload, name="upload-validate"),
    path("confirm/", confirm_upload, name="upload-confirm"),
    path("history/", upload_history, name="upload-history"),
    path("overview/", all_outlets_overview, name="upload-overview"),
    path("pending-approvals/", pending_approvals, name="upload-pending-approvals"),
    path("audit-log/", audit_log_list, name="audit-log"),
    path("<int:log_id>/approve/", approve_upload, name="upload-approve"),
    path("<int:log_id>/reject/", reject_upload, name="upload-reject"),
    path("<int:log_id>/delete/", delete_upload, name="upload-delete"),
    path("<int:log_id>/deletion-preview/", deletion_preview, name="upload-deletion-preview"),
    path("<int:log_id>/diff/", upload_diff, name="upload-diff"),
    path("orphans/", orphan_list, name="orphan-list"),
    path("orphans/purge/", orphan_purge, name="orphan-purge"),
    path("orphans/purge-all/", orphan_purge_all, name="orphan-purge-all"),

    # Damage / Wastage Entry Listing pipeline
    path("damage/validate/", damage_validate, name="damage-validate"),
    path("damage/confirm/", damage_confirm, name="damage-confirm"),
    path("damage/batches/", damage_batches, name="damage-batches"),
    path("damage/stats/", damage_stats, name="damage-stats"),
    path("damage/overview/", damage_overview, name="damage-overview"),
    path("damage/batches/<int:batch_id>/", damage_batch_detail, name="damage-batch-detail"),
    path("damage/batches/<int:batch_id>/approve/", damage_approve, name="damage-batch-approve"),
    path("damage/batches/<int:batch_id>/reject/", damage_reject, name="damage-batch-reject"),
    path("damage/batches/<int:batch_id>/delete/", damage_delete, name="damage-batch-delete"),
    path("damage/batches/<int:batch_id>/deletion-preview/", damage_deletion_preview, name="damage-batch-deletion-preview"),

    # Office Use Listing pipeline
    path("office/validate/", office_validate, name="office-validate"),
    path("office/confirm/", office_confirm, name="office-confirm"),
    path("office/batches/", office_batches, name="office-batches"),
    path("office/stats/", office_stats, name="office-stats"),
    path("office/overview/", office_overview, name="office-overview"),
    path("office/batches/<int:batch_id>/", office_batch_detail, name="office-batch-detail"),
    path("office/batches/<int:batch_id>/approve/", office_approve, name="office-batch-approve"),
    path("office/batches/<int:batch_id>/reject/", office_reject, name="office-batch-reject"),
    path("office/batches/<int:batch_id>/delete/", office_delete, name="office-batch-delete"),
    path("office/batches/<int:batch_id>/deletion-preview/", office_deletion_preview, name="office-batch-deletion-preview"),

    # Verifications Listing pipeline
    path("verification/validate/", verification_validate, name="verification-validate"),
    path("verification/confirm/", verification_confirm, name="verification-confirm"),
    path("verification/batches/", verification_batches, name="verification-batches"),
    path("verification/stats/", verification_stats, name="verification-stats"),
    path("verification/overview/", verification_overview, name="verification-overview"),
    path("verification/batches/<int:batch_id>/", verification_batch_detail, name="verification-batch-detail"),
    path("verification/batches/<int:batch_id>/approve/", verification_approve, name="verification-batch-approve"),
    path("verification/batches/<int:batch_id>/reject/", verification_reject, name="verification-batch-reject"),
    path("verification/batches/<int:batch_id>/delete/", verification_delete, name="verification-batch-delete"),
    path("verification/batches/<int:batch_id>/deletion-preview/", verification_deletion_preview, name="verification-batch-deletion-preview"),

    # GRN (Direct Goods Received Note) pipeline
    path("grn/validate/", grn_validate, name="grn-validate"),
    path("grn/confirm/", grn_confirm, name="grn-confirm"),
    path("grn/batches/", grn_batches, name="grn-batches"),
    path("grn/stats/", grn_stats, name="grn-stats"),
    path("grn/overview/", grn_overview, name="grn-overview"),
    path("grn/batches/<int:batch_id>/", grn_batch_detail, name="grn-batch-detail"),
    path("grn/batches/<int:batch_id>/approve/", grn_approve, name="grn-batch-approve"),
    path("grn/batches/<int:batch_id>/reject/", grn_reject, name="grn-batch-reject"),
    path("grn/batches/<int:batch_id>/delete/", grn_delete, name="grn-batch-delete"),
    path("grn/batches/<int:batch_id>/deletion-preview/", grn_deletion_preview, name="grn-batch-deletion-preview"),

    # Return to Supplier pipeline
    path("rts/validate/", rts_validate, name="rts-validate"),
    path("rts/confirm/", rts_confirm, name="rts-confirm"),
    path("rts/batches/", rts_batches, name="rts-batches"),
    path("rts/stats/", rts_stats, name="rts-stats"),
    path("rts/overview/", rts_overview, name="rts-overview"),
    path("rts/batches/<int:batch_id>/", rts_batch_detail, name="rts-batch-detail"),
    path("rts/batches/<int:batch_id>/approve/", rts_approve, name="rts-batch-approve"),
    path("rts/batches/<int:batch_id>/reject/", rts_reject, name="rts-batch-reject"),
    path("rts/batches/<int:batch_id>/delete/", rts_delete, name="rts-batch-delete"),
    path("rts/batches/<int:batch_id>/deletion-preview/", rts_deletion_preview, name="rts-batch-deletion-preview"),

    # Sales (Bill Listing) pipeline
    path("sales/validate/", sales_validate, name="sales-validate"),
    path("sales/confirm/", sales_confirm, name="sales-confirm"),
    path("sales/batches/", sales_batches, name="sales-batches"),
    path("sales/stats/", sales_stats, name="sales-stats"),
    path("sales/overview/", sales_overview, name="sales-overview"),
    path("sales/batches/<int:batch_id>/", sales_batch_detail, name="sales-batch-detail"),
    path("sales/batches/<int:batch_id>/approve/", sales_approve, name="sales-batch-approve"),
    path("sales/batches/<int:batch_id>/reject/", sales_reject, name="sales-batch-reject"),
    path("sales/batches/<int:batch_id>/delete/", sales_delete, name="sales-batch-delete"),
    path("sales/batches/<int:batch_id>/deletion-preview/", sales_deletion_preview, name="sales-batch-deletion-preview"),

    # Super-admin operations dashboard + reports
    path("operations/today/", operations_today, name="operations-today"),
    path("reports/daily-sales/", daily_sales, name="report-daily-sales"),
    path("reports/item-rankings/", item_rankings, name="report-item-rankings"),
    path("reports/wastage/", wastage_summary, name="report-wastage"),
    path("reports/anomalies/", anomalies, name="report-anomalies"),

    # Supplier master (admin) + Supplier Scorecard (super-admin)
    path("suppliers/", supplier_list_create, name="supplier-list-create"),
    path("suppliers/<int:pk>/", supplier_detail, name="supplier-detail"),
    path("suppliers/scorecard/", supplier_scorecard, name="supplier-scorecard"),
    path("suppliers/<str:code>/scorecard/", supplier_detail_scorecard, name="supplier-detail-scorecard"),

    # Unified uploaded-sheets (manager + admin)
    path("all-uploads/", uploaded_sheets_list, name="uploaded-sheets-list"),
    path("all-uploads/coverage/", uploaded_sheets_coverage, name="uploaded-sheets-coverage"),
    path("all-uploads/bulk-delete/", uploaded_sheet_bulk_delete, name="uploaded-sheets-bulk-delete"),
    path("all-uploads/<int:sheet_id>/", uploaded_sheet_detail, name="uploaded-sheet-detail"),
    path("all-uploads/<int:sheet_id>/delete/", uploaded_sheet_delete, name="uploaded-sheet-delete"),

    # Sales Returns pipeline
    path("sales_returns/validate/", sales_returns_validate, name="sales-returns-validate"),
    path("sales_returns/confirm/", sales_returns_confirm, name="sales-returns-confirm"),
    path("sales_returns/batches/", sales_returns_batches, name="sales-returns-batches"),
    path("sales_returns/stats/", sales_returns_stats, name="sales-returns-stats"),
    path("sales_returns/overview/", sales_returns_overview, name="sales-returns-overview"),
    path("sales_returns/batches/<int:batch_id>/", sales_returns_batch_detail, name="sales-returns-batch-detail"),
    path("sales_returns/batches/<int:batch_id>/approve/", sales_returns_approve, name="sales-returns-batch-approve"),
    path("sales_returns/batches/<int:batch_id>/reject/", sales_returns_reject, name="sales-returns-batch-reject"),
    path("sales_returns/batches/<int:batch_id>/delete/", sales_returns_delete, name="sales-returns-batch-delete"),
    path("sales_returns/batches/<int:batch_id>/deletion-preview/", sales_returns_deletion_preview, name="sales-returns-batch-deletion-preview"),
]
