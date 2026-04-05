from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "role", "outlet", "is_active"]
    list_filter = ["role", "is_active"]
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("Info", {"fields": ("role", "outlet", "is_active")}),
        ("Permissions", {"fields": ("is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"fields": ("username", "password1", "password2", "role", "outlet")}),
    )
    ordering = ["username"]
    search_fields = ["username"]
    filter_horizontal = ("groups", "user_permissions")
