import React from "react";

export default function ArchivedPaymentsFilters({ filters, setFilters }) {
  return (
    <div className="filters-bar">
      {/* SEARCH */}
      <input
        placeholder="Search reference, name, phone"
        value={filters.search || ""}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />

      {/* UNIT */}
      <select
        value={filters.unit_code || ""}
        onChange={(e) => setFilters({ ...filters, unit_code: e.target.value })}
      >
        <option value="">All Units</option>
        {Array.from({ length: 24 }).map((_, i) => (
          <option key={i} value={`Unit-${i + 1}`}>
            Unit-{i + 1}
          </option>
        ))}
      </select>

      {/* METHOD */}
      <select
        value={filters.method || ""}
        onChange={(e) => setFilters({ ...filters, method: e.target.value })}
      >
        <option value="">All Methods</option>
        <option value="mpesa">Mpesa</option>
        <option value="pesalink">PesaLink</option>
        <option value="bank">Bank</option>
        <option value="cash">Cash</option>
        <option value="cheque">Cheque</option>
      </select>
    </div>
  );
}
