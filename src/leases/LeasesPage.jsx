console.log("THIS IS THE REAL LEASES PAGE");

import React, { useState, useMemo } from "react";
import { useLeases } from "../hooks/useLeases";
import { useProperties } from "../hooks/useProperties";
import { usePayments } from "../hooks/usePayments";
import { formatCurrency, formatDate } from "../utils/formatters";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabaseClient";

export default function LeasesPage() {
  const navigate = useNavigate();

  // Load leases
  const { leases, loading, error } = useLeases(200);

  // Load properties
  const { properties } = useProperties();

  // Filters
  const [search, setSearch] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Sorting
  const [sortField, setSortField] = useState("tenant_name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Drawer state
  const [selectedLease, setSelectedLease] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Load payments for selected lease
  const { payments, paymentsLoading } = usePayments(selectedLease?.id);

  const openLease = (lease) => {
    setSelectedLease(lease);
    setEditForm(lease);
    setIsEditing(false);
  };

  const closeLease = () => setSelectedLease(null);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortIcon = (field) => {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "▲" : "▼";
  };

  const resetFilters = () => {
    setSearch("");
    setPropertyFilter("");
    setStatusFilter("");
  };

  const updateForm = (field, value) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveLeaseChanges = async () => {
    const { error } = await supabase
      .from("leases")
      .update({
        tenant_name: editForm.tenant_name,
        unit_code: editForm.unit_code,
        rent_amount: editForm.rent_amount,
        due_day: editForm.due_day,
        billing_cycle: editForm.billing_cycle,
        start_date: editForm.start_date,
      })
      .eq("id", selectedLease.id);

    if (!error) {
      setSelectedLease(editForm);
      setIsEditing(false);
    }
  };

  // FILTERING
  const filteredLeases = useMemo(() => {
    let result = leases;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (lease) =>
          lease.tenant_name?.toLowerCase().includes(term) ||
          lease.unit_code?.toLowerCase().includes(term) ||
          lease.status?.toLowerCase().includes(term) ||
          lease.billing_cycle?.toLowerCase().includes(term)
      );
    }

    if (propertyFilter) {
      result = result.filter((lease) => lease.property_id === propertyFilter);
    }

    if (statusFilter) {
      result = result.filter((lease) => lease.status === statusFilter);
    }

    return result;
  }, [leases, search, propertyFilter, statusFilter]);

  // SORTING
  const sortedLeases = useMemo(() => {
    return [...filteredLeases].sort((a, b) => {
      const x = a[sortField];
      const y = b[sortField];

      if (x == null) return 1;
      if (y == null) return -1;

      if (typeof x === "string") {
        return sortDirection === "asc"
          ? x.localeCompare(y)
          : y.localeCompare(x);
      }

      return sortDirection === "asc" ? x - y : y - x;
    });
  }, [filteredLeases, sortField, sortDirection]);

  // GROUPING
  const leasesByOwner = useMemo(() => {
    const owners = {};

    for (const lease of sortedLeases) {
      const oid = lease.owner_id;
      const pid = lease.property_id;

      if (!owners[oid]) {
        owners[oid] = {
          owner_id: oid,
          owner_name: lease.owner_name,
          properties: {},
        };
      }

      if (!owners[oid].properties[pid]) {
        owners[oid].properties[pid] = {
          property_id: pid,
          property_name: lease.property_name,
          leases: [],
        };
      }

      owners[oid].properties[pid].leases.push(lease);
    }

    return Object.values(owners).map((owner) => ({
      ...owner,
      properties: Object.values(owner.properties),
    }));
  }, [sortedLeases]);

  return (
    <div className="leases-content">
      
      {/* PAGE HEADER */}
      <div className="page-header">
        <div className="page-title-block">
          <h1 className="page-title">Leases</h1>
          <p className="page-subtitle">{leases?.length || 0} leases</p>
        </div>

        <div className="page-actions">
          <button className="btn primary">Add Lease</button>
          <button className="btn secondary export-btn">Export</button>
          <button className="btn danger-outline reset-btn" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      {/* FILTERS BAR */}
      <div className="card filters-card">
        <div className="filters-bar">
          <input
            type="text"
            className="filter-input"
            placeholder="Search tenants, units, leases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
            <option value="upcoming">Upcoming</option>
          </select>

          <select
            className="filter-select"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <input type="date" className="filter-input" />
          <input type="date" className="filter-input" />

          <select className="filter-select">
            <option value="">Any Cycle</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>

      {/* LEASE LIST */}
      <div className="leases-list">
        {loading && <p className="muted">Loading leases…</p>}
        {error && <p className="error">Failed to load leases: {error.message}</p>}
        {!loading && leases.length === 0 && (
          <p className="muted">No leases found.</p>
        )}

        {leasesByOwner.map((owner, index) => (
          <div key={owner.owner_id} className="owner-group">
            {index > 0 && <div className="section-divider"></div>}

            <h1 className="owner-header">{owner.owner_name}</h1>

            {owner.properties.map((property) => (
              <div key={property.property_id} className="property-group">
                <h2 className="property-header">
                  {property.property_name}
                  <span className="count-pill">
                    {property.leases.length} leases
                  </span>
                </h2>

                <div className="card">
                  <table className="leases-table">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort("tenant_name")}>
                          Tenant {sortIcon("tenant_name")}
                        </th>
                        <th onClick={() => handleSort("unit_code")}>
                          Unit {sortIcon("unit_code")}
                        </th>
                        <th onClick={() => handleSort("rent_amount")}>
                          Rent {sortIcon("rent_amount")}
                        </th>
                        <th onClick={() => handleSort("status")}>
                          Status {sortIcon("status")}
                        </th>
                        <th onClick={() => handleSort("start_date")}>
                          Start Date {sortIcon("start_date")}
                        </th>
                        <th onClick={() => handleSort("due_day")}>
                          Due Day {sortIcon("due_day")}
                        </th>
                        <th onClick={() => handleSort("billing_cycle")}>
                          Cycle {sortIcon("billing_cycle")}
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {property.leases.map((lease) => (
                        <tr
                          key={lease.id}
                          onClick={() => openLease(lease)}
                          className="clickable-row"
                        >
                          <td>{lease.tenant_name}</td>
                          <td>{lease.unit_code}</td>
                          <td>{formatCurrency(lease.rent_amount)}</td>
                          <td>
                            <span className={`status-pill ${lease.status}`}>
                              {lease.status}
                            </span>
                          </td>
                          <td>{formatDate(lease.start_date)}</td>
                          <td>Day {lease.due_day}</td>
                          <td>{lease.billing_cycle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* DRAWER */}
      {selectedLease && (
        <div className="drawer-overlay" onClick={closeLease}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            
            {/* HEADER */}
            <div className="drawer-header">
              <div>
                <h2 className="drawer-title">{selectedLease.tenant_name}</h2>
                <p className="drawer-subtitle">{selectedLease.unit_code}</p>
              </div>
              <button className="btn ghost" onClick={closeLease}>✕</button>
            </div>

            {/* LEASE DETAILS */}
            <div className="drawer-section">
              <h3>Lease Details</h3>

              <div className="drawer-field">
                <label>Tenant</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.tenant_name}
                    onChange={(e) => updateForm("tenant_name", e.target.value)}
                  />
                ) : (
                  <span>{selectedLease.tenant_name}</span>
                )}
              </div>

              <div className="drawer-field">
                <label>Unit</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.unit_code}
                    onChange={(e) => updateForm("unit_code", e.target.value)}
                  />
                ) : (
                  <span>{selectedLease.unit_code}</span>
                )}
              </div>

              <div className="drawer-field">
                <label>Rent</label>
                {isEditing ? (
                  <input
                    type="number"
                    value={editForm.rent_amount}
                    onChange={(e) => updateForm("rent_amount", Number(e.target.value))}
                  />
                ) : (
                  <span>Ksh {selectedLease.rent_amount}</span>
                )}
              </div>

              <div className="drawer-field">
                <label>Status</label>
                <span className={`status-pill ${selectedLease.status}`}>
                  {selectedLease.status}
                </span>
              </div>

              <div className="drawer-field">
                <label>Start Date</label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => updateForm("start_date", e.target.value)}
                  />
                ) : (
                  <span>{selectedLease.start_date}</span>
                )}
              </div>

              <div className="drawer-field">
                <label>Due Day</label>
                {isEditing ? (
                  <input
                    type="number"
                    value={editForm.due_day}
                    onChange={(e) => updateForm("due_day", Number(e.target.value))}
                  />
                ) : (
                  <span>Day {selectedLease.due_day}</span>
                )}
              </div>

              <div className="drawer-field">
                <label>Cycle</label>
                {isEditing ? (
                  <select
                    value={editForm.billing_cycle}
                    onChange={(e) => updateForm("billing_cycle", e.target.value)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                ) : (
                  <span>{selectedLease.billing_cycle}</span>
                )}
              </div>
            </div>

            {/* PAYMENT HISTORY */}
            <div className="drawer-section">
              <h3>Payment History</h3>

              {paymentsLoading && <p className="muted">Loading payments…</p>}

              {!paymentsLoading && payments.length === 0 && (
                <p className="muted">No payments recorded for this lease.</p>
              )}

              {!paymentsLoading && payments.length > 0 && (
                <>
                  <div className="payments-list">
                    {payments.map((p) => (
                      <div key={p.id} className="payment-item">
                        <div>
                          <strong>{formatCurrency(p.amount)}</strong>
                          <p className="payment-date">{formatDate(p.date)}</p>
                        </div>

                        <span className={`payment-status ${p.status}`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="view-all-payments">
                    <button
                      className="btn link"
                      onClick={() =>
                        navigate("/payments?lease_id=" + selectedLease.id)
                      }
                    >
                      View all payments →
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ACTIONS */}
            <div className="drawer-actions">
              {isEditing ? (
                <>
                  <button className="btn primary" onClick={saveLeaseChanges}>
                    Save Changes
                  </button>
                  <button className="btn secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={() => setIsEditing(true)}>
                    Edit Lease
                  </button>
                  <button className="btn danger">Terminate Lease</button>
                  <button className="btn secondary">Send Reminder</button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
