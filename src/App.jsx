import { Route, Routes } from "react-router-dom";

import OverviewPage from "./dashboard/OverviewPage";
import ArchivedPaymentsPage from "./dashboard/payments/archived/ArchivedPaymentsPage";
import DashboardLayout from "./layout/DashboardLayout";
import LeasesPage from "./leases/LeasesPage";
import NewPayment from "./payments/NewPayment";

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/archived-payments" element={<ArchivedPaymentsPage />} />
        <Route path="/leases" element={<LeasesPage />} />
        {/* Future pages */}
        <Route path="/payments/new" element={<NewPayment />} />
        {/* <Route path="/bank-transactions/:id" element={<BankTransactionPage />} /> */}
      </Route>
    </Routes>
  );
}

