import { useEffect, useState } from "react";
import {
  fetchDashboardOverview,
  fetchMonths,
} from "../api/dashboard";

export function useOverviewData(selectedMonth) {
  const [month, setMonth] = useState(selectedMonth || null);
  const [months, setMonths] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load available months once
  useEffect(() => {
    let cancelled = false;

    fetchMonths()
      .then((data) => {
        if (cancelled) return;

        const raw = Array.isArray(data?.months) ? data.months : [];

        const formatted = raw
          .map((item) => {
            if (
              typeof item === "object" &&
              item !== null &&
              typeof item.year === "number" &&
              typeof item.month === "number"
            ) {
              const paddedMonth = String(item.month).padStart(2, "0");
              return {
                value: `${item.year}-${paddedMonth}`, // for API
                label: item.label || `${item.year}-${paddedMonth}`, // for display
              };
            }
            return null;
          })
          .filter(Boolean);

        setMonths(formatted);

        if (!month && formatted.length > 0) {
          setMonth(formatted[0].value);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch months:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load overview whenever month changes
  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDashboardOverview(month)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch overview:", err);
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  return {
    month,
    setMonth,
    months,
    overview,
    loading,
    error,
  };
}
