import React from "react";

export default function ArchivedPaymentDrawer({ payment, onClose, onRestore }) {
  if (!payment) return null;

  return (
    <div className="drawer slide-in">
      <div className="drawer-header">
        <h2>Payment Details</h2>
        <button onClick={onClose}>✕</button>
      </div>

      <div className="drawer-body">
        <h3>Metadata</h3>
        <p><strong>Paid At:</strong> {payment.paid_at}</p>
        <p><strong>Amount:</strong> KES {payment.amount.toLocaleString()}</p>
        <p><strong>Method:</strong> {payment.payment_method}</p>
        <p><strong>Source:</strong> {payment.source}</p>
        <p><strong>Reference:</strong> {payment.bank_reference || payment.mpesa_code}</p>
        <p><strong>Archive Reason:</strong> {payment.archive_reason}</p>

        <h3>Tenant</h3>
        <p><strong>Name:</strong> {payment.tenant_name}</p>
        <p><strong>Unit:</strong> {payment.unit_code}</p>

        <h3>Bank Match</h3>
        {payment.matched_bank_row_id ? (
          <div className="bank-match">
            <p>Matched to bank row <strong>{payment.matched_bank_row_id}</strong></p>
          </div>
        ) : (
          <p>No bank match found</p>
        )}

        <h3>Actions</h3>
        <button className="restore-btn" onClick={() => onRestore(payment.id)}>
          Restore to Live Payments
        </button>
      </div>
    </div>
  );
}
