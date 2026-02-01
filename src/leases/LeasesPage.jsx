import React, { useState, useMemo } from "react";
import { useLeases } from "../hooks/useLeases";
import { useProperties } from "../hooks/useProperties";

export default function LeasesPage() {
  // Load leases
  const { leases, loading, error } = useLeases(200);

  // Load properties (for the dropdown)
  const { properties } = useProperties();

  // Search filter
  const [search, setSearch] = useState("");

  // Property filter
  const [propertyFilter, setPropertyFilter] = useState("");

  const [statusFilter, setStatusFilter] = useState("");


  // Sorting state
  const [sortField, setSortField] = useState("tenant_name");
  const [sortDirection, setSortDirection] = useState("asc");

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

  // GROUPING: Owner → Property → Leases
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
    <div className="leases-page">
      <div className="leases-container">
        {/* PAGE HEADER */}
        <div className="page-header">
          <div className="page-title-block">
            <h1 className="page-title">Leases</h1>
            <p className="page-subtitle">{leases?.length || 0} leases</p>
          </div>

          <div className="page-actions">
            <button className="btn primary">Add Lease</button>
            <button className="btn secondary">Export</button>
          </div>
        </div>

        {/* FILTERS BAR */}
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

          <button className="btn ghost small">Reset</button>
        </div>

        {/* MAIN PANEL */}
        <div className="panel">
          <h2>Leases</h2>

          {loading && <p className="muted">Loading leases…</p>}
          {error && (
            <p className="error">Failed to load leases: {error.message}</p>
          )}
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
                    <span className="count-pill">{property.leases.length} leases </span>
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
                        <tr key={lease.id}>
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
      </div>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(amount);
}
