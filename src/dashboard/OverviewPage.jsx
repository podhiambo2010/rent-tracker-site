// src/dashboard/OverviewPage.jsx
import React, { useEffect } from "react";
import "./OverviewPage.css";

import useDashboardKPIs from "../hooks/useDashboardKPIs";

export default function OverviewPage() {
  
  // Fetch real KPI data from Supabase
  const { loading, kpi } = useDashboardKPIs();

  // Count-up animation for KPI values
  useEffect(() => {
    const counters = document.querySelectorAll(".count-up");

    counters.forEach(counter => {
      const target = +counter.getAttribute("data-value");
      let current = 0;
      const increment = target / 60; // 1-second animation

      const update = () => {
        current += increment;
        if (current < target) {
          counter.innerText = "KES " + Math.floor(current).toLocaleString();
          requestAnimationFrame(update);
        } else {
          counter.innerText = "KES " + target.toLocaleString();
        }
      };

      update();
    });
  }, []);

  if (loading) {
    return <div className="overview-content">Loading dashboard…</div>;
  }

  return (
    <div className="overview-content">

      {/* KPI GRID */}
      <div className="summary-grid">

        <div className="summary-card kpi-blue">
          <div className="kpi-header">
            <i className="ri-home-8-line kpi-icon"></i>
            <div className="label">Total Rent Expected</div>
          </div>
          <div className="value count-up" data-value={kpi.totalRentExpected}>
            KES {kpi.totalRentExpected.toLocaleString()}
          </div>
          <div className="subtext">Across 24 active leases</div>
          <div className="trend up">▲ 5%</div>
        </div>

        <div className="summary-card kpi-green">
          <div className="kpi-header">
            <i className="ri-money-dollar-circle-line kpi-icon"></i>
            <div className="label">Total Collected</div>
          </div>
          <div className="value count-up" data-value={kpi.totalCollected}>
            KES {kpi.totalCollected.toLocaleString()}
          </div>

          <div className="subtext">78% collection rate</div>
          <div className="trend up">▲ 5%</div>
        </div>

        <div className="summary-card kpi-red">
          <div className="kpi-header">
            <i className="ri-error-warning-line kpi-icon"></i>
            <div className="label">Outstanding Arrears</div>
          </div>
          <div className="value count-up" data-value={kpi.outstandingArrears}>
            KES {kpi.outstandingArrears.toLocaleString()}
          </div>

          <div className="subtext">7 tenants overdue</div>
          <div className="trend down">▼ 3%</div>
        </div>

        <div className="summary-card kpi-green">
          <div className="kpi-header">
            <i className="ri-user-smile-line kpi-icon"></i>
            <div className="label">Tenants in Credit</div>
          </div>
          <div className="value count-up" data-value={kpi.tenantsInCredit}>
            KES {kpi.tenantsInCredit.toLocaleString()}
          </div>

          <div className="subtext">3 tenants ahead</div>
          <div className="trend up">▲ 8%</div>
        </div>

      </div>
      {/* END KPI GRID */}

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

    </div>
  );
}
