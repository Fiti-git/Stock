from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    MeView,
    UserListCreateView,
    UserDetailView,
    LoggingTokenObtainPairView,
    LoginEventListView,
    PermissionRegistryView,
    UserPermissionsDetailView,
    SetManagerPinView,
)

urlpatterns = [
    path("login/", LoggingTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("users/", UserListCreateView.as_view(), name="user-list"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("users/<int:pk>/set-manager-pin/", SetManagerPinView.as_view(), name="user-set-manager-pin"),
    path("login-events/", LoginEventListView.as_view(), name="login-events"),
    path("permissions/", PermissionRegistryView.as_view(), name="permission-registry"),
    path("user-permissions/<int:pk>/", UserPermissionsDetailView.as_view(), name="user-permissions-detail"),
]
