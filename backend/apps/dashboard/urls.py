from django.urls import path
from .views import (
    count_progress, variances, alerts, submit_count, count_items,
    admin_summary, daily_counts, daily_upload_report, daily_upload_new_items,
    stock_variance_report, counted_items_report, mobile_devices_report,
    approve_count, reject_count, bulk_approve_counts,
    list_count_sessions, close_count_session, count_session_detail,
    list_variance_records, resolve_variance, bulk_resolve_variance,
    count_coverage_report, counter_performance, coverage_by_day,
)

urlpatterns = [
    path("count-progress/", count_progress, name="count-progress"),
    path("variances/", variances, name="variances"),
    path("alerts/", alerts, name="alerts"),
    path("counts/", submit_count, name="submit-count"),
    path("counts/<int:count_id>/approve/", approve_count, name="approve-count"),
    path("counts/<int:count_id>/reject/", reject_count, name="reject-count"),
    path("counts/bulk-approve/", bulk_approve_counts, name="bulk-approve-counts"),
    path("count-items/", count_items, name="count-items"),
    path("admin-summary/", admin_summary, name="admin-summary"),
    path("daily-counts/", daily_counts, name="daily-counts"),
    path("daily-upload-report/", daily_upload_report, name="daily-upload-report"),
    path("daily-upload-report/new-items/", daily_upload_new_items, name="daily-upload-new-items"),
    path("stock-variance-report/", stock_variance_report, name="stock-variance-report"),
    path("count-coverage-report/", count_coverage_report, name="count-coverage-report"),
    path("coverage-by-day/", coverage_by_day, name="coverage-by-day"),
    path("counted-items-report/", counted_items_report, name="counted-items-report"),
    path("counter-performance/", counter_performance, name="counter-performance"),
    path("mobile-devices/", mobile_devices_report, name="mobile-devices"),

    path("count-sessions/", list_count_sessions, name="count-sessions"),
    path("count-sessions/<int:session_id>/", count_session_detail, name="count-session-detail"),
    path("count-sessions/<int:session_id>/close/", close_count_session, name="close-count-session"),

    path("variance-records/", list_variance_records, name="variance-records"),
    path("variance-records/<int:record_id>/resolve/", resolve_variance, name="resolve-variance"),
    path("variance-records/bulk-resolve/", bulk_resolve_variance, name="bulk-resolve-variance"),
]
