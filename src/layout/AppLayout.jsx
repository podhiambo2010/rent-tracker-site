import React from "react";

export function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">R</div>
          <div className="sidebar-brand-name">RentEra</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-item active">
            <span className="sidebar-item-icon">🏠</span>
            <span>Overview</span>
          </div>
          <div className="sidebar-item">
            <span className="sidebar-item-icon">📄</span>
            <span>Leases</span>
          </div>
          {/* add other items later */}
        </nav>

        <div className="sidebar-footer">
          Hello Peter
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
