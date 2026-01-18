import React from "react";
import { useLeases } from "../hooks/useLeases";

export default function LeasesPage() {
  const { leases, loading, error } = useLeases(200);

  return (
    <div className="panel">
      <h2>Leases</h2>

      {loading && <p className="muted">Loading leases…</p>}
      {error && <p className="error">Failed to load leases: {error.message}</p>}
      {!loading && leases.length === 0 && <p className="muted">No leases found.</p>}

      {leases.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Unit</th>
              <th>Rent</th>
              <th>Status</th>
              <th>Start</th>
              <th>Due Day</th>
              <th>Cycle</th>
            </tr>
          </thead>
          <tbody>
            {leases.map((lease) => (
              <tr key={lease.id}>
                <td>{lease.tenant_name || lease.tenant_id}</td>
                <td>{lease.unit_code || lease.unit_id}</td>
                <td>{lease.rent_amount}</td>
                <td>{lease.status}</td>
                <td>{lease.start_date}</td>
                <td>{lease.due_day}</td>
                <td>{lease.billing_cycle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
