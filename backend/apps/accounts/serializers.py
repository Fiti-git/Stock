from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework import serializers
from .models import User
from .permission_registry import (
    effective_permissions_for,
    systems_for_user,
    ALL_CODES_SET,
)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_active:
            raise AuthenticationFailed("This account has been deactivated.")
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["outlet_id"] = user.outlet_id
        token["outlet_name"] = user.outlet.outlet_name if user.outlet else None
        token["username"] = user.username
        return token


class UserSerializer(serializers.ModelSerializer):
    outlet_name = serializers.CharField(source="outlet.outlet_name", read_only=True)
    permissions = serializers.SerializerMethodField()
    permissions_overridden = serializers.SerializerMethodField()
    systems = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "role", "outlet_id", "outlet_name",
            "is_active", "permissions", "permissions_overridden", "systems",
        ]

    def get_permissions(self, obj):
        return effective_permissions_for(obj)

    def get_permissions_overridden(self, obj):
        return obj.permissions_override is not None

    def get_systems(self, obj):
        return systems_for_user(obj)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "password", "role", "outlet", "is_active"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["username", "role", "outlet", "is_active", "password"]

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class PermissionsOverrideSerializer(serializers.Serializer):
    """Payload for PATCH /auth/user-permissions/<id>/."""
    # None (or missing) clears the override, empty list means "no permissions",
    # otherwise an explicit list of known codes.
    permissions_override = serializers.ListField(
        child=serializers.CharField(),
        allow_null=True,
        required=True,
    )

    def validate_permissions_override(self, value):
        if value is None:
            return None
        unknown = [c for c in value if c not in ALL_CODES_SET]
        if unknown:
            raise serializers.ValidationError(
                f"Unknown permission codes: {', '.join(unknown)}"
            )
        # De-dupe while preserving order.
        seen = set()
        cleaned = []
        for c in value:
            if c not in seen:
                seen.add(c)
                cleaned.append(c)
        return cleaned
