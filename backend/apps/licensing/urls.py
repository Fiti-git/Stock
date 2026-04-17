from django.urls import path

from apps.licensing import views

urlpatterns = [
    path('config/', views.license_config, name='license-config'),
    path('config/test/', views.license_config_test, name='license-config-test'),
    path('config/audit/', views.license_config_audit, name='license-config-audit'),
    path('status/', views.license_status, name='license-status'),
    path('refresh/', views.license_refresh, name='license-refresh'),
]
