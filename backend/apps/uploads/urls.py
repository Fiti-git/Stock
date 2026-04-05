from django.urls import path
from .views import (
    validate_upload,
    confirm_upload,
    upload_history,
    pending_approvals,
    approve_upload,
    reject_upload,
    delete_upload,
)

urlpatterns = [
    path("validate/", validate_upload, name="upload-validate"),
    path("confirm/", confirm_upload, name="upload-confirm"),
    path("history/", upload_history, name="upload-history"),
    path("pending-approvals/", pending_approvals, name="upload-pending-approvals"),
    path("<int:log_id>/approve/", approve_upload, name="upload-approve"),
    path("<int:log_id>/reject/", reject_upload, name="upload-reject"),
    path("<int:log_id>/delete/", delete_upload, name="upload-delete"),
]
