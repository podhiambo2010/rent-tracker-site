import { apiGet } from "./apiClient";

export function fetchLeases(limit = 200) {
  return apiGet(`/leases?limit=${limit}`);
}
