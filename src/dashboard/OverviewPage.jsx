// src/dashboard/OverviewPage.jsx
import React from "react";
import { useOverviewData } from "../hooks/useOverviewData";
import { useCollectionSummary } from "../hooks/useCollectionSummary";

export default function OverviewPage() {
  const {
    month,
    setMonth,
    months,
    overview,
    loading: overviewLoading,
    error: overviewError,
  } = useOverviewData();

  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
  } = useCollectionSummary();

  return (
    <div className="panel">
      <h2>Overview</h2>

      <div className="toolbar">
        <label>
          <span>Month:</span>
          <select
            value={month || ""}
            onChange={(e) => setMonth(e.target.value || null)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {overviewLoading && <p className="muted">Loading overview…</p>}
      {overviewError && (
        <p className="error">Failed to load overview: {overviewError.message}</p>
      )}

      {overview && (
        <div className="kpi-grid">
          {/* Adjust keys based on actual /dashboard/overview response */}
          <div className="kpi-card">
            <h3>Active Leases</h3>
            <p>{overview.active_leases ?? "—"}</p>
          </div>
          <div className="kpi-card">
            <h3>Unpaid Invoices</h3>
            <p>{overview.unpaid_invoices ?? "—"}</p>
          </div>
          <div className="kpi-card">
            <h3>Rent Due</h3>
            <p>{overview.rent_due_total ?? "—"}</p>
          </div>
          <div className="kpi-card">
            <h3>Rent Collected</h3>
            <p>{overview.amount_paid_total ?? "—"}</p>
          </div>
        </div>
      )}

      <hr />

      <h3>Collection Summary</h3>

      {summaryLoading && <p className="muted">Loading collection summary…</p>}
      {summaryError && (
        <p className="error">
          Failed to load collection summary: {summaryError.message}
        </p>
      )}

      {summary && summary.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Month Start</th>
              <th>Rent Due</th>
              <th>Amount Paid</th>
              <th>Balance</th>
              <th>Collection Rate (%)</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.month_start}>
                <td>{row.month_start}</td>
                <td>{row.rent_due_total}</td>
                <td>{row.amount_paid_total}</td>
                <td>{row.balance_total}</td>
                <td>{row.collection_rate_pct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
