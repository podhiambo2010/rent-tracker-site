import { useEffect, useState } from "react";
import { supabase } from "../api/supabaseClient";

export function usePayments(leaseId) {
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  useEffect(() => {
    if (!leaseId) return;

    async function load() {
      setPaymentsLoading(true);

      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("lease_id", leaseId)
        .order("date", { ascending: false });

      if (!error) {
        setPayments(data || []);
      }

      setPaymentsLoading(false);
    }

    load();
  }, [leaseId]);

  return { payments, paymentsLoading };
}

