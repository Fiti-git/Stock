from rest_framework import serializers
from .models import Outlet


class OutletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Outlet
        fields = ["id", "outlet_name", "short_code", "location_code", "created_at"]
