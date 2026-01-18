// src/hooks/useCollectionSummary.js
import { useEffect, useState } from "react";
import { fetchCollectionSummaryMonth } from "../api/dashboard";

export function useCollectionSummary() {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCollectionSummaryMonth()
      .then((data) => {
        if (cancelled) return;
        setSummary(Array.isArray(data) ? data : []);
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
  }, []);

  return { summary, loading, error };
}
