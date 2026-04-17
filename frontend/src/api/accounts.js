import api from "./client";

export const getLoginEvents = ({ user, ip, success, fromDate, toDate, page = 1 } = {}) =>
  api.get("/auth/login-events/", {
    params: {
      ...(user ? { user } : {}),
      ...(ip ? { ip } : {}),
      ...(success === true ? { success: "true" } : success === false ? { success: "false" } : {}),
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
      page,
    },
  });
