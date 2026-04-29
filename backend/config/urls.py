from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

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
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
