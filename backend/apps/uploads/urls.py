from django.urls import path
from .views import (
    validate_upload,
    confirm_upload,
    upload_history,
    pending_approvals,
    approve_upload,
    reject_upload,
    delete_upload,
    all_outlets_overview,
    audit_log_list,
    upload_diff,
)

urlpatterns = [
    path("validate/", validate_upload, name="upload-validate"),
    path("confirm/", confirm_upload, name="upload-confirm"),
    path("history/", upload_history, name="upload-history"),
    path("overview/", all_outlets_overview, name="upload-overview"),
    path("pending-approvals/", pending_approvals, name="upload-pending-approvals"),
    path("audit-log/", audit_log_list, name="audit-log"),
    path("<int:log_id>/approve/", approve_upload, name="upload-approve"),
    path("<int:log_id>/reject/", reject_upload, name="upload-reject"),
    path("<int:log_id>/delete/", delete_upload, name="upload-delete"),
    path("<int:log_id>/diff/", upload_diff, name="upload-diff"),
]
