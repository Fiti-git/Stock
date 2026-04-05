from django.urls import path
from .views import count_progress, variances, alerts, submit_count, count_items, shrinkage

urlpatterns = [
    path("count-progress/", count_progress, name="count-progress"),
    path("variances/", variances, name="variances"),
    path("alerts/", alerts, name="alerts"),
    path("counts/", submit_count, name="submit-count"),
    path("count-items/", count_items, name="count-items"),
    path("shrinkage/", shrinkage, name="shrinkage"),
]
