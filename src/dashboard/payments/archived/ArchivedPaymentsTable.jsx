import React from "react";

function generateInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ArchivedPaymentsTable({ items, onSelect }) {
  return (
    <table className="payments-table">
      <thead>
        <tr>
          <th>Paid At</th>
          <th>Unit</th>
          <th>Tenant</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Reference</th>
          <th>Source</th>
          <th>Reason</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {items.map((p) => (
          <tr key={p.id} className="fade-in">
            <td>{new Date(p.paid_at).toLocaleDateString()}</td>
            <td>{p.unit_code}</td>

            <td>
              <div className="tenant-cell">
                <div className="avatar">
                  {generateInitials(p.tenant_name)}
                </div>
                <span>{p.tenant_name}</span>
              </div>
            </td>

            <td style={{ textAlign: "right" }}>
              KES {p.amount.toLocaleString()}
            </td>

            <td>{p.payment_method}</td>
            <td>{p.bank_reference || p.mpesa_code}</td>
            <td>{p.source}</td>

            <td>
              <span
                className={`reason-tag reason-${(p.archive_reason || "other")
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {p.archive_reason}
              </span>
            </td>

            <td>
              <button onClick={() => onSelect(p)}>View</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
