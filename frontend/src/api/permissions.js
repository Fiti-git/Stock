import api from "./client";

export const getPermissionRegistry = () => api.get("/auth/permissions/");
export const getUserPermissions = (userId) => api.get(`/auth/user-permissions/${userId}/`);
export const updateUserPermissions = (userId, permissions_override) =>
  api.patch(`/auth/user-permissions/${userId}/`, { permissions_override });
