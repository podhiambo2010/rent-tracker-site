// src/layout/DashboardLayout.jsx

import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import logo from "../assets/RentEra_Logo.png";
import "./DashboardLayout.css";

export default function DashboardLayout() {
  const [theme, setTheme] = useState("light");

  const user = {
    name: "Peter", // temporary placeholder
  };

  const firstName =
    user?.name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "User";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">R</div>
          <div className="sidebar-brand-name">RentEra</div>
        </div>

        <nav className="sidebar-nav">
          {/* MAIN */}
          <div className="sidebar-section-label">MAIN</div>

          <NavLink to="/" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            🏠 Dashboard
          </NavLink>

          <NavLink to="/leases" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            🔑 Leases
          </NavLink>

          <NavLink to="/rent-roll" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            📄 Rent Roll
          </NavLink>

          <NavLink to="/balances" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            💰 Balances
          </NavLink>

          <NavLink to="/payments" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            🚙 Payments
          </NavLink>

          <NavLink to="/reports" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            📊 Reports
          </NavLink>

          {/* COMMUNICATION */}
          <div className="sidebar-section-label">COMMUNICATION</div>

          <NavLink to="/whatsapp" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            💬 WhatsApp Messaging
          </NavLink>

          <NavLink to="/dunning" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            📢 Dunning & Reminders
          </NavLink>

          {/* ADMINISTRATION */}
          <div className="sidebar-section-label">ADMINISTRATION</div>

          <NavLink to="/property-setup" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            🏢 Property Setup
          </NavLink>

          <NavLink to="/users" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            👥 User Management
          </NavLink>

          <NavLink to="/notifications" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            🔔 Notifications
          </NavLink>

          <NavLink to="/audit-logs" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            📜 Audit Logs
          </NavLink>

          <NavLink to="/settings" className={({ isActive }) => isActive ? "sidebar-item active" : "sidebar-item"}>
            ⚙️ Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <button
            className="btn secondary"
            onClick={() =>
              setTheme(theme === "light" ? "dark" : "light")
            }
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content dashboard-shell">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-left">
            <img src={logo} alt="RentEra Logo" className="logo" />
          </div>

          <div className="topbar-right">
            <span className="hello">Hello, {firstName}</span>

            <button className="icon-btn">
              <i className="ri-notification-3-line"></i>
            </button>

            <button className="icon-btn">
              <i className="ri-settings-3-line"></i>
            </button>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
