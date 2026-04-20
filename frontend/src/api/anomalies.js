import api from "./client";

export const getAnomalies = () => api.get("/uploads/reports/anomalies/");
