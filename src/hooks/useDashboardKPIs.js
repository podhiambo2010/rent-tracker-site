import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function useDashboardKPIs() {
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({
    totalRentExpected: 0,
    totalCollected: 0,
    outstandingArrears: 0,
    tenantsInCredit: 0,
  });

  useEffect(() => {
    async function loadKPIs() {
      setLoading(true);

      console.log("🔍 Loading KPIs...");

      // -----------------------------
      // 1. ACTIVE LEASES → RENT EXPECTED
      // -----------------------------
      const { data: leases, error: leasesError } = await supabase
        .from("leases")
        .select("rent_amount, status")
        .eq("status", "active");

      if (leasesError) {
        console.error("❌ Leases error:", leasesError);
      } else {
        console.log("📄 Leases:", leases);
      }

      const totalRentExpected =
        leases?.reduce((sum, l) => sum + Number(l.rent_amount || 0), 0) || 0;

      // -----------------------------
      // 2. PAYMENTS VIEW → TOTAL COLLECTED (THIS MONTH)
      // -----------------------------
      const firstDay = new Date();
      firstDay.setDate(1);

      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("amount, paid_at")
        .gte("paid_at", firstDay.toISOString());

      if (paymentsError) {
        console.error("❌ Payments error:", paymentsError);
      } else {
        console.log("📄 Payments:", payments);
      }

      const totalCollected =
        payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // -----------------------------
      // 3. BALANCES VIEW → ARREARS + CREDIT
      // -----------------------------
      const { data: balances, error: balancesError } = await supabase
        .from("v_monthly_rent_balances")
        .select("rent_due_total, amount_paid_total, balance_total");

      if (balancesError) {
        console.error("❌ Balances error:", balancesError);
      } else {
        console.log("📄 Balances:", balances);
      }

      const outstandingArrears =
        balances?.reduce(
          (sum, b) =>
            sum +
            (Number(b.balance_total) > 0 ? Number(b.balance_total) : 0),
          0
        ) || 0;

      const tenantsInCredit =
        balances?.reduce(
          (sum, b) =>
            sum +
            (Number(b.balance_total) < 0
              ? Math.abs(Number(b.balance_total))
              : 0),
          0
        ) || 0;

      // -----------------------------
      // 4. UPDATE STATE
      // -----------------------------
      setKpi({
        totalRentExpected,
        totalCollected,
        outstandingArrears,
        tenantsInCredit,
      });

      setLoading(false);

      console.log("✅ KPI Load Complete:", {
        totalRentExpected,
        totalCollected,
        outstandingArrears,
        tenantsInCredit,
      });
    }

    loadKPIs();
  }, []);

  return { loading, kpi };
}