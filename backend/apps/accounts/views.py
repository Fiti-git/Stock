from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.uploads.models import AuditLog
from .models import User
from .permissions import IsAdmin
from .serializers import UserSerializer, UserCreateSerializer, UserUpdateSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class UserListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.select_related("outlet").order_by("username")
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.save()
        AuditLog.objects.create(
            user=request.user,
            action="user_created",
            entity_type="user",
            entity_id=str(user.id),
            details={"username": user.username, "role": user.role, "outlet_id": user.outlet_id},
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def get_object(self, pk):
        try:
            return User.objects.select_related("outlet").get(pk=pk)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSerializer(user).data)

    def patch(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        was_active = user.is_active
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        updated = serializer.save()
        changes = {k: str(v) for k, v in request.data.items() if k != "password"}
        action = "user_deactivated" if was_active and not updated.is_active else \
                 "user_activated" if not was_active and updated.is_active else "user_updated"
        AuditLog.objects.create(
            user=request.user,
            action=action,
            entity_type="user",
            entity_id=str(updated.id),
            details={"username": updated.username, "changes": changes},
        )
        return Response(UserSerializer(updated).data)

    def delete(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if user == request.user:
            return Response({"detail": "Cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            user=request.user,
            action="user_deleted",
            entity_type="user",
            entity_id=str(user.id),
            details={"username": user.username, "role": user.role},
        )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
