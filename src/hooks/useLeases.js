import { useEffect, useState } from "react";
import { fetchLeases } from "../api/leases";

export function useLeases(limit = 200) {
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchLeases(limit)
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [data];
        setLeases(arr);
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
  }, [limit]);

  return { leases, loading, error };
}
