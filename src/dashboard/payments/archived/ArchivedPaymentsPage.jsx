import React, { useState, useEffect } from "react";
import ArchivedPaymentsFilters from "./ArchivedPaymentsFilters";
import ArchivedPaymentsTable from "./ArchivedPaymentsTable";
import ArchivedPaymentDrawer from "./ArchivedPaymentDrawer";
import { useArchivedPayments } from "./useArchivedPayments";

export default function ArchivedPaymentsPage() {
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  const { data, loading } = useArchivedPayments(filters, page);

  // -----------------------------
  // THEME TOGGLE
  // -----------------------------
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  // -----------------------------
  // TOAST
  // -----------------------------
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // -----------------------------
  // CSV EXPORT
  // -----------------------------
  function exportCSV() {
    if (!data.items || data.items.length === 0) return;

    const headers = [
      "id",
      "paid_at",
      "amount",
      "unit_code",
      "tenant_name",
      "payment_method",
      "bank_reference",
      "source",
      "archive_reason"
    ];

    const rows = data.items.map((p) => [
      p.id,
      p.paid_at,
      p.amount,
      p.unit_code,
      p.tenant_name,
      p.payment_method,
      p.bank_reference || p.mpesa_code || "",
      p.source,
      p.archive_reason
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "archived_payments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // -----------------------------
  // RESTORE PAYMENT
  // -----------------------------
  async function restorePayment(id) {
    const res = await fetch(`/admin/payments/restore/${id}`, {
      method: "POST",
      headers: {
        "X-Admin-Token": localStorage.getItem("admin_token")
      }
    });

    if (res.ok) {
      showToast("Payment restored successfully");
    } else {
      showToast("Failed to restore payment");
    }

    setSelected(null);
    window.location.reload();
  }

  return (
    <div className="archived-page">
      {/* HEADER */}
      <div className="header">
        <h1>Archived Payments</h1>
        <p className="subtitle">
          Payments here are excluded from balances, rent roll, and dunning.
        </p>

        <button className="export-btn" onClick={exportCSV}>
          Export CSV
        </button>

        <button className="theme-toggle" onClick={toggleTheme}>
          Toggle Theme
        </button>
      </div>

      {/* FILTERS */}
      <ArchivedPaymentsFilters filters={filters} setFilters={setFilters} />

      {/* TABLE OR LOADING */}
      {loading ? (
        <div>
          <div className="skeleton" style={{ height: "40px", marginBottom: "10px" }}></div>
          <div className="skeleton" style={{ height: "40px", marginBottom: "10px" }}></div>
          <div className="skeleton" style={{ height: "40px", marginBottom: "10px" }}></div>
        </div>
      ) : (
        <ArchivedPaymentsTable items={data.items} onSelect={setSelected} />
      )}

      {/* DRAWER */}
      <ArchivedPaymentDrawer
        payment={selected}
        onClose={() => setSelected(null)}
        onRestore={restorePayment}
      />

      {/* PAGINATION */}
      <div className="pagination">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.ceil(data.total / 50)}
        </span>
        <button
          disabled={(page + 1) * 50 >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
