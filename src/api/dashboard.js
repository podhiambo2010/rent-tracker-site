// src/api/dashboard.js
import { apiGet } from "./apiClient";

// GET /dashboard/overview?month=YYYY-MM
export function fetchDashboardOverview(month) {
  const params = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiGet(`/dashboard/overview${params}`);
}

// GET /metrics/collection_summary_month
export function fetchCollectionSummaryMonth() {
  return apiGet(`/metrics/collection_summary_month`);
}

// GET /months
export function fetchMonths(limit = 36) {
  return apiGet(`/months?limit=${limit}`);
}
