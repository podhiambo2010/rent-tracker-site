// src/dashboard/OverviewPage.jsx
import React from "react";

export default function OverviewPage() {
  return (
    <div className="overview-page">
      {/* KPI GRID */}
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h3>Total Rent Expected</h3>
          <div className="value">KES 620,000</div>
          <div className="subtext">Across 24 active leases</div>
        </div>

        <div className="dashboard-card">
          <h3>Total Collected</h3>
          <div className="value">KES 482,000</div>
          <div className="subtext">78% collection rate</div>
        </div>

        <div className="dashboard-card">
          <h3>Outstanding Arrears</h3>
          <div className="value">KES 138,000</div>
          <div className="subtext">7 tenants overdue</div>
        </div>

        <div className="dashboard-card">
          <h3>Tenants in Credit</h3>
          <div className="value">KES 74,969</div>
          <div className="subtext">3 tenants ahead</div>
        </div>
      </div>

      {/* CENTER WIDGETS */}
      <section className="center-widgets">
        <div className="widget">
          <h3>Collections — Last 3 Months</h3>
          <div className="chart-placeholder">[Bar + Line Chart]</div>
          <p>Collection Rate: 78%</p>
          <p>Trend: ▼ –5% vs last month</p>
        </div>

        <div className="widget">
          <h3>Cashflow — Year to Date</h3>
          <div className="chart-placeholder">[Bar Chart]</div>
          <table className="cashflow-table">
            <tbody>
              <tr><td>Income</td><td>KES 1,210,000</td></tr>
              <tr><td>Expenses</td><td>KES 320,000</td></tr>
              <tr><td>Net</td><td>KES 890,000</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* BOTTOM WIDGETS */}
      <section className="bottom-widgets">
        <div className="widget">
          <h3>Top 10 Tenant Balances</h3>
          <div className="table-placeholder">[Tenant Ledger Table]</div>
        </div>

        <div className="widget">
          <h3>Attention Needed</h3>
          <ul className="alerts-list">
            <li>Overdue tenants: 5 → View list</li>
            <li>Upcoming due (7 days): 4 → View list</li>
            <li>Unsent invoices: 3 → Generate</li>
            <li>Reminders sent today: 12 → View log</li>
          </ul>
          <button className="dunning-btn">Run Dunning Engine</button>
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <footer className="quick-actions">
        <button>Add Tenant</button>
        <button>Add Lease</button>
        <button>Generate Monthly Invoices</button>
        <button>Export Balances</button>
        <button>View Rent Roll</button>
        <button>Record Payment</button>
      </footer>

      {/* INLINE STYLES */}
      <style>{`
/* ROOT LAYOUT */
.overview-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 1.75rem;
  font-family: "Segoe UI", sans-serif;
  background: #f5f6f8;
  box-sizing: border-box;
}

/* TOP NAVIGATION */
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  padding: 0.55rem 1rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  font-size: 0.9rem;
  box-sizing: border-box;
  min-height: 48px;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.nav-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.search-input {
  width: 240px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  white-space: nowrap;
}

.nav-icon {
  font-size: 1rem;
  cursor: pointer;
}

.nav-user {
  font-size: 0.85rem;
}

/* KPI / DASHBOARD CARDS */
.dashboard-cards {
  display: flex;
  justify-content: space-between;
  gap: 0.9rem;
  margin-top: 0.8rem;
  flex-wrap: nowrap;
}

.dashboard-card {
  flex: 1 1 0;
  max-width: 210px;
  background: #ffffff;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  border: 1px solid #e0e0e0;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  box-sizing: border-box;
}

.dashboard-card:hover {
  box-shadow: 0 3px 8px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

.dashboard-card h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: #003366;
  margin: 0 0 0.25rem 0;
}

.dashboard-card .value {
  font-size: 1.15rem;
  font-weight: 600;
  color: #222;
  margin: 0 0 0.15rem 0;
}

.dashboard-card .subtext {
  font-size: 0.7rem;
  color: #777;
  margin: 0;
}

/* CENTER WIDGETS */
.center-widgets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.widget {
  background: #ffffff;
  padding: 1rem;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  box-sizing: border-box;
}

.widget h3 {
  font-size: 0.9rem;
  margin: 0 0 0.6rem 0;
}

.chart-placeholder {
  background: #f0f0f0;
  height: 160px;
  border-radius: 6px;
  margin-bottom: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 0.8rem;
}

.cashflow-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.cashflow-table td {
  padding: 0.25rem 0;
}

/* BOTTOM WIDGETS */
.bottom-widgets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.alerts-list {
  margin: 0.8rem 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
}

.alerts-list li {
  margin-bottom: 0.25rem;
}

.dunning-btn {
  padding: 0.5rem 0.9rem;
  background: #d9534f;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

/* QUICK ACTIONS */
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.5rem;
}

.quick-actions button {
  padding: 0.5rem 0.9rem;
  background: #0078d4;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

/* RESPONSIVE TWEAKS */
@media (max-width: 1024px) {
  .dashboard-cards {
    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .center-widgets,
  .bottom-widgets {
    grid-template-columns: 1fr;
  }

  .top-nav {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .nav-center {
    justify-content: flex-start;
  }
}
      `}</style>
    </div>
  );
}
