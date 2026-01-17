import React from "react";
import ReactDOM from "react-dom/client";
import ArchivedPaymentsPage from "./dashboard/payments/archived/ArchivedPaymentsPage";
import "./global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ArchivedPaymentsPage />
  </React.StrictMode>
);
