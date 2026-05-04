from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve as static_serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/outlets/", include("apps.outlets.urls")),
    path("api/items/", include("apps.items.urls")),
    path("api/uploads/", include("apps.uploads.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/license/", include("apps.licensing.urls")),
    path("api/db/", include("apps.dbops.urls")),
    path("api/org/", include("apps.org_catalog.urls")),
    path("api/pos/", include("apps.pos.urls")),
    path("api/transfers/", include("apps.transfers.urls")),
    path("api/storefront/", include("apps.catalog_ext.urls")),
    path("api/ecom/", include("apps.ecom.urls")),
    re_path(r"^media/(?P<path>.*)$", static_serve, {"document_root": settings.MEDIA_ROOT}),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
