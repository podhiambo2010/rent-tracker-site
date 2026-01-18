// src/hooks/useOverviewData.js
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

      const arr = Array.isArray(data) ? data : [data];
      setMonths(arr);

      if (!month && arr.length > 0) {
        setMonth(arr[0]);
      }
    })

      .catch((err) => {
        if (cancelled) return;
        console.error(err);
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
        console.error(err);
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
