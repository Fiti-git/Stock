from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Outlet
from .serializers import OutletSerializer
from apps.accounts.permissions import IsAdmin


class OutletListCreateView(generics.ListCreateAPIView):
    queryset = Outlet.objects.all()
    serializer_class = OutletSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAdmin()]
        return [IsAuthenticated()]


class OutletDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Outlet.objects.all()
    serializer_class = OutletSerializer

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT", "DELETE"):
            return [IsAdmin()]
        return [IsAuthenticated()]
