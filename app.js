/* ==================== Rent Tracker Dashboard — app.js ==================== */

/* small DOM helpers */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

/* -------- global state -------- */
const state = {
  apiBase: (typeof API_BASE !== "undefined" && API_BASE) || "",
  currentMonth: null, // 'YYYY-MM'
};

/* -------- formatting helpers -------- */
function yyyymm(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

function formatMonthLabel(ym) {
  // ym is 'YYYY-MM' or 'YYYY-MM-01'
  if (!ym) return "—";
  const s = ym.length === 7 ? ym + "-01" : ym;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return ym;
  return dt.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
}

function fmtNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("en-KE", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

function fmtKes(n) {
  if (n == null || Number.isNaN(Number(n))) return "KES 0";
  return `KES ${fmtNumber(n)}`;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.0%";
  return `${Number(n).toFixed(1)}%`;
}

/* normalise KE phone similar to backend */
function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D+/g, "");
  if (digits.startsWith("2547") && digits.length === 12) return digits;
  if (digits.startsWith("07") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 9) return "254" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  return digits;
}

/* -------- API helpers -------- */
function getAdminTokenFromStorage() {
  return localStorage.getItem("admin_token") || "";
}

async function apiGet(path) {
  const url = state.apiBase.replace(/\/+$/, "") + path;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${txt}`);
  }
  return res.json();
}

async function apiPost(path, body, { admin = false } = {}) {
  const url = state.apiBase.replace(/\/+$/, "") + path;
  const headers = { "Content-Type": "application/json" };
  if (admin) {
    const t = getAdminTokenFromStorage();
    if (t) headers["X-Admin-Token"] = t;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> ${res.status} ${txt}`);
  }
  return res.json();
}

/* -------- core loaders -------- */

async function loadOverview() {
  const kpiLeases   = $("#kpiLeases");
  const kpiOpen     = $("#kpiOpen");
  const kpiPayments = $("#kpiPayments");
  const kpiBalance  = $("#kpiBalance");

  const labelEl   = $("#summaryMonthLabel");
  const dueEl     = $("#summaryMonthDue");
  const collEl    = $("#summaryMonthCollected");
  const balEl     = $("#summaryMonthBalance");
  const rateEl    = $("#summaryMonthRate");

  const ym = state.currentMonth;

  try {
    const [leases, payments, rentRollResp, dash] = await Promise.all([
      apiGet("/leases?limit=1000"),
      apiGet(`/payments?month=${encodeURIComponent(ym)}`),
      apiGet(`/rent-roll?month=${encodeURIComponent(ym)}`),
      apiGet(`/dashboard/overview?month=${encodeURIComponent(ym)}`),
    ]);

    const rentRoll = rentRollResp && rentRollResp.data ? rentRollResp.data : [];

    // KPIs
    kpiLeases.textContent = leases.length ?? 0;

    const openCount = rentRoll.filter((r) => (r.status || "").toLowerCase() !== "paid").length;
    kpiOpen.textContent = openCount;

    const paymentsTotal = payments.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    kpiPayments.textContent = fmtKes(paymentsTotal);

    kpiBalance.textContent = fmtKes(dash.balance_total ?? dash.total_outstanding ?? 0);

    // Monthly collection summary
    const monthLabel = formatMonthLabel(dash.month_start || ym);
    labelEl.textContent = monthLabel;

    const totalDue  = dash.total_due ?? dash.rent_due_total ?? dash.rent_subtotal_total ?? 0;
    const totalPaid = dash.total_paid ?? dash.amount_paid_total ?? 0;
    const balance   = dash.balance_total ?? dash.total_outstanding ?? 0;
    const rate      = dash.collection_rate_pct ?? (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0);

    dueEl.textContent   = `${fmtKes(totalDue)} invoiced`;
    collEl.textContent  = `${fmtKes(totalPaid)} collected`;
    balEl.textContent   = `${fmtKes(balance)} outstanding`;
    rateEl.textContent  = `${fmtPct(rate)} collection rate`;
  } catch (err) {
    console.error("loadOverview error:", err);
    kpiLeases.textContent   = "—";
    kpiOpen.textContent     = "—";
    kpiPayments.textContent = "—";
    kpiBalance.textContent  = "—";
    labelEl.textContent     = "Error loading";
  }
}

async function loadLeases() {
  const body = $("#leasesBody");
  const empty = $("#leasesEmpty");
  const searchTerm = ($("#leaseSearch").value || "").trim().toLowerCase();

  body.innerHTML = "";
  empty.classList.add("hidden");

  try {
    const leases = await apiGet("/leases?limit=1000");
    const rows = leases.filter((l) => {
      if (!searchTerm) return true;
      const t = (l.tenant || "").toLowerCase();
      const u = (l.unit || "").toLowerCase();
      return t.includes(searchTerm) || u.includes(searchTerm);
    });

    if (!rows.length) {
      empty.classList.remove("hidden");
      return;
    }

    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.tenant || ""}</td>
        <td>${r.unit || ""}</td>
        <td>${fmtKes(r.rent_amount || 0)}</td>
        <td>${r.billing_cycle || ""}</td>
        <td>${r.due_day != null ? r.due_day : ""}</td>
        <td>${r.lease_status || ""}</td>
        <td>
          <button class="btn ghost btn-wa-lease" data-lease-id="${r.lease_id}">
            WhatsApp
          </button>
        </td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadLeases error:", err);
    empty.textContent = "Error loading leases.";
    empty.classList.remove("hidden");
  }
}

async function loadPayments(initial = false) {
  const monthSelect = $("#paymentsMonth");
  const tenantFilter = ($("#paymentsTenant").value || "").trim().toLowerCase();
  const statusFilter = ($("#paymentsStatus").value || "").trim().toLowerCase();
  const body = $("#paymentsBody");
  const empty = $("#paymentsEmpty");

  body.innerHTML = "";
  empty.classList.add("hidden");

  try {
    if (initial) {
      // populate months selector once
      const months = await apiGet("/payments/months");
      monthSelect.innerHTML = "";
      for (const row of months) {
        const opt = document.createElement("option");
        opt.value = row.ym;
        opt.textContent = formatMonthLabel(row.ym);
        monthSelect.appendChild(opt);
      }
      if (!monthSelect.value && months[0]) {
        monthSelect.value = state.currentMonth;
      }
    }

    const month = monthSelect.value || state.currentMonth;
    const payments = await apiGet(`/payments?month=${encodeURIComponent(month)}`);

    const filtered = payments.filter((p) => {
      if (tenantFilter) {
        const t = (p.tenant || "").toLowerCase();
        if (!t.includes(tenantFilter)) return false;
      }
      if (statusFilter) {
        const s = (p.status || "posted").toLowerCase();
        if (s !== statusFilter) return false;
      }
      return true;
    });

    if (!filtered.length) {
      empty.classList.remove("hidden");
      return;
    }

    for (const p of filtered) {
      const tr = document.createElement("tr");
      const dt = p.paid_at || p.created_at;
      tr.innerHTML = `
        <td>${dt ? new Date(dt).toLocaleString() : ""}</td>
        <td>${p.tenant || ""}</td>
        <td>${p.method || ""}</td>
        <td>${(p.status || "posted")}</td>
        <td style="text-align:right">${fmtKes(p.amount || 0)}</td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadPayments error:", err);
    empty.textContent = "Error loading payments.";
    empty.classList.remove("hidden");
  }
}

async function loadRentRoll(initial = false) {
  const monthSelect = $("#rentrollMonth");
  const tenantFilter = ($("#rentrollTenant").value || "").trim().toLowerCase();
  const propertyFilter = ($("#rentrollProperty").value || "").trim().toLowerCase();
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");

  body.innerHTML = "";
  empty.classList.add("hidden");

  try {
    if (initial) {
      // simple month selector – use current + maybe 3 recent months from payments
      if (!monthSelect.options.length) {
        const ym = state.currentMonth;
        const opt = document.createElement("option");
        opt.value = ym;
        opt.textContent = formatMonthLabel(ym);
        monthSelect.appendChild(opt);
        monthSelect.value = ym;
      }
    }

    const month = monthSelect.value || state.currentMonth;
    const resp = await apiGet(`/rent-roll?month=${encodeURIComponent(month)}`);
    const rows = resp && resp.data ? resp.data : [];

    const filtered = rows.filter((r) => {
      if (tenantFilter) {
        const t = (r.tenant || "").toLowerCase();
        if (!t.includes(tenantFilter)) return false;
      }
      if (propertyFilter) {
        const p = (r.property_name || "").toLowerCase();
        if (!p.includes(propertyFilter)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      empty.classList.remove("hidden");
      return;
    }

    for (const r of filtered) {
      const period =
        r.period_start ? formatMonthLabel(String(r.period_start).slice(0, 7)) : "";
      const balance = Number(r.balance || 0);
      const status = (r.status || "").toLowerCase();

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.property_name || ""}</td>
        <td>${r.unit_code || ""}</td>
        <td>${r.tenant || ""}</td>
        <td>${period}</td>
        <td>${fmtKes(r.subtotal_rent || 0)}</td>
        <td>${fmtKes(r.late_fees || 0)}</td>
        <td>
          <span class="status ${
            status === "paid" ? "ok" : "due"
          }">${status || "—"}</span>
        </td>
        <td style="text-align:right">${fmtKes(balance)}</td>
        <td>
          <button class="btn ghost btn-wa-lease" data-lease-id="${r.lease_id}">
            WhatsApp
          </button>
        </td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadRentRoll error:", err);
    empty.textContent = "Error loading rent-roll.";
    empty.classList.remove("hidden");
  }
}

async function loadBalances() {
  const body = $("#balancesBody");
  const empty = $("#balancesEmpty");

  const monthLabelEl = $("#balMonthLabel");
  const monthDueEl = $("#balMonthDue");
  const monthCollEl = $("#balMonthCollected");
  const monthBalEl = $("#balMonthBalance");
  const monthRateEl = $("#balMonthRate");

  const outstandingBody = $("#outstandingBody");
  const outstandingEmpty = $("#outstandingEmpty");
  const outstandingUpdated = $("#outstandingLastUpdated");

  body.innerHTML = "";
  outstandingBody.innerHTML = "";
  empty.classList.add("hidden");
  outstandingEmpty.classList.add("hidden");

  const ym = state.currentMonth;

  try {
    const [balResp, overview, outstandingResp] = await Promise.all([
      apiGet(`/balances?month=${encodeURIComponent(ym)}`),
      apiGet(`/balances/overview?month=${encodeURIComponent(ym)}`),
      apiGet(`/metrics/monthly-outstanding?month=${encodeURIComponent(ym)}`),
    ]);

    // ---------- per-tenant balances table ----------
    const rows = balResp.rows || [];
    if (!rows.length) empty.classList.remove("hidden");

    for (const r of rows) {
      const due = Number(r.rent_due_total || 0);
      const paid = Number(r.amount_paid_total || 0);
      const bal = Number(r.balance_total || 0);
      const rate = due > 0 ? (paid / due) * 100 : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.tenant_name || ""}</td>
        <td class="num">${fmtNumber(due)}</td>
        <td class="num">${fmtNumber(paid)}</td>
        <td class="num">${fmtNumber(bal)}</td>
        <td class="num">${fmtPct(rate)}</td>
      `;
      body.appendChild(tr);
    }

    // ---------- "This month totals" card ----------
    const monthLabel = formatMonthLabel(
      overview.month || overview.month_start || ym
    );
    monthLabelEl.textContent = monthLabel;

    const totalDue  = overview.total_due  ?? overview.rent_subtotal_total ?? 0;
    const totalPaid = overview.total_paid ?? overview.amount_paid_total   ?? 0;
    const balance   = overview.balance_total ?? overview.total_outstanding ?? 0;
    const rate      =
      overview.collection_rate_pct ??
      (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0);

    monthDueEl.textContent  = `${fmtKes(totalDue)} due`;
    monthCollEl.textContent = `${fmtKes(totalPaid)} collected`;
    monthBalEl.textContent  = `${fmtKes(balance)} balance`;
    monthRateEl.textContent = `${fmtPct(rate)} collection rate`;

    // ---------- Outstanding by tenant ----------
    const outData = outstandingResp && outstandingResp.data ? outstandingResp.data : [];
    if (!outData.length) {
      outstandingEmpty.classList.remove("hidden");
    } else {
      for (const r of outData) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.tenant || ""}</td>
          <td style="text-align:right">${fmtKes(r.outstanding || 0)}</td>
          <td style="text-align:right">${fmtPct(r.collection_rate || 0)}</td>
        `;
        outstandingBody.appendChild(tr);
      }
    }

    outstandingUpdated.textContent = `Last updated: ${new Date().toLocaleString()}`;
  } catch (err) {
    console.error("loadBalances error:", err);
    empty.textContent = "Error loading balances.";
    empty.classList.remove("hidden");
    outstandingEmpty.classList.remove("hidden");
  }
}

/* -------- WhatsApp ad-hoc builder -------- */
function initWhatsAppBuilder() {
  const btn = $("#waBuild");
  const out = $("#waResult");

  if (!btn) return;

  btn.addEventListener("click", () => {
    const tenant = ($("#waTenant").value || "tenant").trim();
    const period = ($("#waPeriod").value || "this period").trim();
    const balNum = Number($("#waBalance").value || 0);
    const rawPhone = ($("#waPhone").value || "").trim();

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      out.textContent = "Please enter a valid phone number.";
      return;
    }

    const msgLines = [
      `Hello ${tenant},`,
      "",
      `Your rent for ${period} has a balance of KSh ${fmtNumber(balNum)}.`,
      "Please settle at your earliest convenience.",
      "",
      "Thank you.",
    ];
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(
      msgLines.join("\n")
    )}`;

    out.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open WhatsApp link</a>`;
  });
}

/* -------- Invoice actions (top bar) -------- */
function initInvoiceActions() {
  const healthBtn = $("#btnHealth");
  const markBtn = $("#btnMarkSent");
  const input = $("#invoiceIdInput");
  const msg = $("#actionMsg");

  if (healthBtn) {
    healthBtn.addEventListener("click", async () => {
      msg.textContent = "Checking admin token…";
      try {
        const headers = {};
        const t = getAdminTokenFromStorage();
        if (t) headers["X-Admin-Token"] = t;
        const res = await fetch(
          state.apiBase.replace(/\/+$/, "") + "/admin/ping",
          { headers }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        msg.textContent = "Admin token OK ✅";
      } catch (err) {
        console.error("auth ping error:", err);
        msg.textContent = "Admin token failed ❌ – check value in Settings.";
      }
    });
  }

  if (markBtn) {
    markBtn.addEventListener("click", async () => {
      const id = (input.value || "").trim();
      if (!id) {
        msg.textContent = "Enter invoice_id (UUID) first.";
        return;
      }
      msg.textContent = "Marking invoice as sent…";

      try {
        const data = await apiPost(
          "/invoices/mark_sent",
          {
            invoice_ids: [id],
            sent_via: "whatsapp",
            sent_to: "tenant",
          },
          { admin: true }
        );
        msg.textContent = `Marked sent: ${data.updated.join(", ")}`;
      } catch (err) {
        console.error("mark_sent error:", err);
        msg.textContent = "Error marking invoice as sent.";
      }
    });
  }
}

/* -------- export helpers (balances CSV) -------- */
function initExports() {
  const btn = $("#btnExportBalances");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const endpoint = btn.dataset.exportEndpoint;
    const prefix = btn.dataset.exportPrefix || "balances";
    if (!endpoint) return;

    const ym = state.currentMonth;
    const url =
      state.apiBase.replace(/\/+$/, "") +
      `${endpoint}?month=${encodeURIComponent(ym)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const fileName = `${prefix}-${ym}.csv`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("export CSV error:", err);
      alert("Error exporting CSV. See console for details.");
    }
  });
}

/* -------- navigation & settings -------- */
function initTabs() {
  const tabs = $$(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) =>
        t.setAttribute("aria-selected", t === tab ? "true" : "false")
      );
      const panels = [
        "overview",
        "leases",
        "payments",
        "rentroll",
        "balances",
        "whatsapp",
        "settings",
      ];
      panels.forEach((name) => {
        const el = $(`#tab-${name}`);
        if (!el) return;
        if (name === target) el.classList.remove("hidden");
        else el.classList.add("hidden");
      });
    });
  });
}

function initApiBaseControls() {
  const apiInput = $("#apiBase");
  const apiInput2 = $("#apiBase2");
  const useBtn = $("#useApi");
  const saveSettings = $("#saveSettings");
  const resetSettings = $("#resetSettings");
  const adminInput = $("#adminToken");

  const storedBase = localStorage.getItem("api_base");
  if (storedBase) state.apiBase = storedBase;

  apiInput && (apiInput.value = state.apiBase);
  apiInput2 && (apiInput2.value = state.apiBase);

  const storedAdmin = getAdminTokenFromStorage();
  if (adminInput && storedAdmin) adminInput.value = storedAdmin;

  if (useBtn) {
    useBtn.addEventListener("click", () => {
      const v = (apiInput.value || "").trim();
      if (v) {
        state.apiBase = v.replace(/\/+$/, "");
        localStorage.setItem("api_base", state.apiBase);
        if (apiInput2) apiInput2.value = state.apiBase;
      }
    });
  }

  if (saveSettings) {
    saveSettings.addEventListener("click", () => {
      const base = (apiInput2.value || "").trim();
      const admin = (adminInput.value || "").trim();
      if (base) {
        state.apiBase = base.replace(/\/+$/, "");
        localStorage.setItem("api_base", state.apiBase);
        if (apiInput) apiInput.value = state.apiBase;
      }
      if (admin) {
        localStorage.setItem("admin_token", admin);
      }
      alert("Settings saved (browser-local).");
    });
  }

  if (resetSettings) {
    resetSettings.addEventListener("click", () => {
      localStorage.removeItem("api_base");
      localStorage.removeItem("admin_token");
      state.apiBase = (typeof API_BASE !== "undefined" && API_BASE) || "";
      if (apiInput) apiInput.value = state.apiBase;
      if (apiInput2) apiInput2.value = state.apiBase;
      if (adminInput) adminInput.value = "";
      alert("Settings reset.");
    });
  }

  const docsBtn = $("#openDocs");
  if (docsBtn) {
    docsBtn.addEventListener("click", () => {
      const url = state.apiBase.replace(/\/+$/, "") + "/docs";
      window.open(url, "_blank", "noopener");
    });
  }
}

/* WhatsApp buttons in leases & rent-roll */
function initRowWhatsAppButtons() {
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-wa-lease");
    if (!btn) return;
    const leaseId = btn.dataset.leaseId;
    if (!leaseId) return;
    const url =
      state.apiBase.replace(/\/+$/, "") +
      `/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}`;
    window.open(url, "_blank", "noopener");
  });
}

/* -------- month picker global -------- */
function initMonthPicker() {
  const mp = $("#monthPicker");
  const nowYm = yyyymm();
  state.currentMonth = nowYm;

  if (mp) {
    mp.value = nowYm;
    mp.addEventListener("change", () => {
      const v = mp.value || nowYm;
      state.currentMonth = v;
      // reload all month-based views
      loadOverview();
      loadPayments(); // reuse filters
      loadRentRoll();
      loadBalances();
    });
  }
}

/* -------- initial load -------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initApiBaseControls();
  initMonthPicker();
  initWhatsAppBuilder();
  initInvoiceActions();
  initExports();
  initRowWhatsAppButtons();

  // initial data load
  loadOverview();
  loadLeases();
  loadPayments(true);
  loadRentRoll(true);
  loadBalances();

  // Reload buttons
  $("#reloadLeases")?.addEventListener("click", loadLeases);
  $("#reloadBalances")?.addEventListener("click", loadBalances);
  $("#reloadOutstandingByTenant")?.addEventListener("click", loadBalances);

  $("#applyPayments")?.addEventListener("click", () => loadPayments());
  $("#clearPayments")?.addEventListener("click", () => {
    $("#paymentsTenant").value = "";
    $("#paymentsStatus").value = "";
    loadPayments();
  });

  $("#applyRentroll")?.addEventListener("click", () => loadRentRoll());
  $("#clearRentroll")?.addEventListener("click", () => {
    $("#rentrollTenant").value = "";
    $("#rentrollProperty").value = "";
    loadRentRoll();
  });

  $("#leaseSearch")?.addEventListener("input", () => loadLeases());
});
