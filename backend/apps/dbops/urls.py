from django.urls import path

from .views import (
    DbBackupCreateView,
    DbBackupDeleteView,
    DbBackupDownloadView,
    DbBackupListView,
    DbRestoreView,
    DbStatusView,
)

urlpatterns = [
    path("status/", DbStatusView.as_view()),
    path("backups/", DbBackupListView.as_view()),
    path("backup/", DbBackupCreateView.as_view()),
    path("restore/", DbRestoreView.as_view()),
    path("backups/<str:filename>/download/", DbBackupDownloadView.as_view()),
    path("backups/<str:filename>/", DbBackupDeleteView.as_view()),
]
