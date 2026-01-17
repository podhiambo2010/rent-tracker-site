import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function DashboardLayout() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div className="shell">
      <header>
        <div className="bar">
          <div className="brand">
            <div className="logo"></div>
            <h1>Rent Tracker Dashboard</h1>
          </div>
          <div className="env">
            <input
              id="apiBase"
              placeholder="API base e.g. https://rent-tracker-api-16i0.onrender.com"
            />
            <button className="btn" id="useApi">
              Use this API
            </button>
            <button className="btn secondary" id="openDocs">
              /docs
            </button>
            <button className="btn ghost" id="setAdminTokenBtn" title="Set Admin Token">
              ⚙️ Admin Token
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* LEFT NAV */}
        <nav aria-label="Sections">
          <Link
            className="tab"
            aria-selected={isActive("/")}
            to="/"
          >
            🏠 Overview
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/leases")}
            to="/leases"
          >
            🔑 Leases
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/payments")}
            to="/payments"
          >
            💸 Payments
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/rent-roll")}
            to="/rent-roll"
          >
            🧾 Rent Roll
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/balances")}
            to="/balances"
          >
            📊 Balances
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/dunning")}
            to="/dunning"
          >
            🔔 Dunning
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/whatsapp")}
            to="/whatsapp"
          >
            📱 WhatsApp
          </Link>
          <Link
            className="tab"
            aria-selected={isActive("/settings")}
            to="/settings"
          >
            ⚙️ Settings
          </Link>
        </nav>

        {/* RIGHT CONTENT */}
        <section>
          <Outlet />
        </section>
      </main>
    </div>
  );
}
