// src/api/apiClient.js

// 1. Default base by environment
const DEFAULT_API_BASE = import.meta.env.DEV
  ? "http://localhost:8000"
  : "https://rent-tracker-api-16i0.onrender.com";

// 2. Read override from localStorage (if any)
export function getStoredApiBase() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("apiBase") || null;
}

export function setStoredApiBase(value) {
  if (typeof window === "undefined") return;
  if (!value) {
    localStorage.removeItem("apiBase");
  } else {
    localStorage.setItem("apiBase", value);
  }
}

// 3. Resolve effective base URL
export function getApiBase() {
  return getStoredApiBase() || DEFAULT_API_BASE;
}

// 4. Generic GET helper
export async function apiGet(path) {
  const base = getApiBase();
  const url = `${base}${path}`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed: ${res.status} ${text}`);
  }

  return res.json();
}
