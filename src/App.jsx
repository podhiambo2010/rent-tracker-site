import React from "react";
import { Routes, Route } from "react-router-dom";

import DashboardLayout from "./layout/DashboardLayout";
import OverviewPage from "./dashboard/OverviewPage";
import ArchivedPaymentsPage from "./dashboard/payments/archived/ArchivedPaymentsPage";
import LeasesPage from "./leases/LeasesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/archived-payments" element={<ArchivedPaymentsPage />} />
        <Route path="/leases" element={<LeasesPage />} />
        {/* Future pages */}
        {/* <Route path="/payments" element={<PaymentsPage />} /> */}
        {/* <Route path="/bank-transactions/:id" element={<BankTransactionPage />} /> */}
      </Route>
    </Routes>
  );
}
