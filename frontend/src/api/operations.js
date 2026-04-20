import api from "./client";

export const getOperationsToday = (dateIso) =>
  api.get("/uploads/operations/today/", {
    params: dateIso ? { date: dateIso } : {},
  });
