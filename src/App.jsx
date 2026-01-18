import React from "react";
import { Routes, Route } from "react-router-dom";

import DashboardLayout from "./layout/DashboardLayout";
import OverviewPage from "./dashboard/OverviewPage";
import ArchivedPaymentsPage from "./dashboard/payments/archived/ArchivedPaymentsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/archived-payments" element={<ArchivedPaymentsPage />} />
        {/* Future pages */}
        {/* <Route path="/payments" element={<PaymentsPage />} /> */}
        {/* <Route path="/leases" element={<LeasesPage />} /> */}
        {/* <Route path="/bank-transactions/:id" element={<BankTransactionPage />} /> */}
      </Route>
    </Routes>
  );
}

<Route path="/leases" element={<LeasesPage />} />
