// src/layout/DashboardLayout.jsx
import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApiBase } from "../hooks/useApiBase";
import renteraLogo from '../assets/RentEra_Logo.png';

export default function DashboardLayout() {
  const location = useLocation();
  const { effectiveBase, override, updateApiBase } = useApiBase();
  const [inputValue, setInputValue] = React.useState(override || effectiveBase);

  function handleUseApiClick() {
    const trimmed = (inputValue || "").trim();
    if (!trimmed) return;
    updateApiBase(trimmed);
  }

  function handleDocsClick() {
    const base = effectiveBase;
    window.open(`${base}/docs`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="dashboard-layout">

    <div className="sidebar-brand">RentEra</div>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <nav>
          <ul>
            <li><NavLink to="/" end>🏠 Overview</NavLink></li>
            <li><NavLink to="/leases">🔑 Leases</NavLink></li>
            <li><NavLink to="/payments">💳 Payments</NavLink></li>
            <li><NavLink to="/rent-roll">📄 Rent Roll</NavLink></li>
            <li><NavLink to="/balances">📊 Balances</NavLink></li>
            <li><NavLink to="/dunning">🔔 Dunning</NavLink></li>
            <li><NavLink to="/whatsapp">📱 WhatsApp</NavLink></li>
            <li><NavLink to="/settings">⚙️ Settings</NavLink></li>
          </ul>
        </nav>
      </aside>

      {/* HEADER BAR (API Controls) */}
<header className="header-bar">
  <div className="bar">

    {/* LEFT SIDE: LOGO + BRAND NAME */}
    <div className="brand">
      <div className="logo-block">
        <img
          src={renteraLogo}
          alt="RentEra"
          className="brand-logo"
        />
        <span className="brand-name">RentEra</span>
      </div>
    </div>

    {/* RIGHT SIDE: API CONTROLS */}
    <div className="env">
      <input
        id="apiBase"
        placeholder="API base e.g. https://rentera-api-16i0.onrender.com"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />

      <button className="btn" onClick={handleUseApiClick}>
        Use this API
      </button>

      <button className="btn secondary" onClick={handleDocsClick}>
        /docs
      </button>

      <button className="btn ghost" title="Set Admin Token">
        ⚙️ Admin Token
      </button>
    </div>

  </div>
</header>

      {/* TOP STRIP (Dashboard Header) */}
      <div className="top-strip">
        <div className="brand-title">
          RentEra | Dashboard
        </div>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Search tenants, units, invoices…"
          />
        </div>

        <div className="user-info">
          <span>🔔</span>
          <span>⚙️</span>
          <span>Hello Peter ▾</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main>
        <section>
          <Outlet />
        </section>
      </main>
    </div>
  );
}
