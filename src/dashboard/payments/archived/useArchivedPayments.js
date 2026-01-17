import { useState, useEffect } from "react";

export function useArchivedPayments(filters, page) {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const params = new URLSearchParams({
        limit: 50,
        offset: page * 50,
        ...filters
      });

      const res = await fetch(`/admin/payments/archived?${params.toString()}`, {
        headers: {
          "X-Admin-Token": localStorage.getItem("admin_token")
        }
      });

      const json = await res.json();
      setData(json);
      setLoading(false);
    }

    load();
  }, [filters, page]);

  return { data, loading };
}
