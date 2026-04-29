from django.urls import path

from .views import (
    transfer_cancel,
    transfer_close,
    transfer_detail,
    transfer_dispatch,
    transfer_receive,
    transfer_request,
    transfers_collection,
)

urlpatterns = [
    path("", transfers_collection, name="transfers-list"),
    path("<int:pk>/", transfer_detail, name="transfer-detail"),
    path("<int:pk>/request/", transfer_request, name="transfer-request"),
    path("<int:pk>/dispatch/", transfer_dispatch, name="transfer-dispatch"),
    path("<int:pk>/receive/", transfer_receive, name="transfer-receive"),
    path("<int:pk>/close/", transfer_close, name="transfer-close"),
    path("<int:pk>/cancel/", transfer_cancel, name="transfer-cancel"),
]
