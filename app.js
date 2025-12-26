/* ==================== Rent Tracker Dashboard — app.js ==================== */

/* small DOM helpers */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

/* -------- global state -------- */
const state = {
  apiBase: (typeof API_BASE !== "undefined" && API_BASE) || "",
  currentMonth: null, // 'YYYY-MM' (single source of truth)
};

/* -------- formatting helpers -------- */
function yyyymm(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

function formatMonthLabel(ym) {
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

function moneyToNumber(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  const isParenNeg = /^\(.*\)$/.test(s);          // (2,000) style
  const n = s.replace(/[^\d.-]/g, "");
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return isParenNeg ? -Math.abs(x) : x;
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.0%";
  return `${Number(n).toFixed(1)}%`;
}

function setText(sel, text) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.textContent = text;
}

function sum(rows, pick) {
  return (rows || []).reduce((acc, r) => acc + moneyToNumber(pick(r)), 0);
}

/* -------- robust HTML escape -------- */
function escapeHtml(s) {
  const str = String(s ?? "");
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
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

/* Try multiple endpoints (helps when backend path names differ) */
async function apiGetFirst(paths) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await apiGet(p);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All endpoints failed");
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

/* -------- month sync (single source of truth) -------- */
function reloadAllMonthViews() {
  loadOverview();
  loadPayments();
  loadRentRoll();
  loadBalances();
  loadBalancesByUnit();
}

function setCurrentMonth(ym, { triggerReload = true } = {}) {
  if (!ym) return;
  state.currentMonth = ym;

  // sync global picker
  const mp = $("#monthPicker");
  if (mp && mp.value !== ym) mp.value = ym;

  // sync tab month selects (if present)
  ["paymentsMonth", "rentrollMonth", "balancesMonth"].forEach((id) => {
    const el = $("#" + id);
    if (el && el.value !== ym) el.value = ym;
  });

  if (triggerReload) reloadAllMonthViews();
}

/* Attach change listener ONCE for any month select */
function wireMonthSelect(selectEl) {
  if (!selectEl) return;
  if (selectEl.dataset.wired === "1") return;
  selectEl.dataset.wired = "1";

  selectEl.addEventListener("change", () => {
    const ym = selectEl.value || state.currentMonth;
    setCurrentMonth(ym, { triggerReload: true });
  });
}

/* -------- month selection helper (Balances uses dropdown) -------- */
function getSelectedMonth() {
  return ($("#balancesMonth")?.value || state.currentMonth || yyyymm());
}

/* -------- Balances renderers (MATCH YOUR HTML IDs) -------- */
function renderBalancesOverview(o) {
  const monthStart = o?.month_start || o?.month || getSelectedMonth();
  const monthLabel = formatMonthLabel(String(monthStart).slice(0, 7));

  const totalDue  = Number(o?.total_due ?? 0);
  const totalPaid = Number(o?.total_paid ?? 0);
  const balTotal  = Number(o?.balance_total ?? 0);
  const cr        = Number(o?.collection_rate_pct ?? (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0));

  setText("#balMonthLabel", monthLabel);
  setText("#balMonthDue", `${fmtKes(totalDue)} due`);
  setText("#balMonthCollected", `${fmtKes(totalPaid)} collected`);
  setText("#balMonthBalance", `${fmtKes(balTotal)} balance`);
  setText("#balMonthRate", `${fmtPct(cr)} collection rate`);
}

function renderBalancesByTenantTable(rows) {
  const tbody = $("#balancesBody");
  const empty = $("#balancesEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";
  empty && empty.classList.add("hidden");

  if (!Array.isArray(rows) || rows.length === 0) {
    if (empty) empty.classList.remove("hidden");
    return;
  }

  for (const r of rows) {
    const tenant = r.tenant ?? "—";
    const due    = Number(r.total_due ?? 0);
    const paid   = Number(r.paid_total ?? 0);
    const bal    = Number(r.balance ?? 0);
    const pct    = Number(r.collection_rate_pct ?? (due > 0 ? (paid / due) * 100 : 0));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(tenant)}</td>
      <td class="num">${fmtKes(due)}</td>
      <td class="num">${fmtKes(paid)}</td>
      <td class="num">${fmtKes(bal)}</td>
      <td class="num">${fmtPct(pct)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderOutstandingTable(rows) {
  const tbody = $("#outstandingBody");
  const empty = $("#outstandingEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";
  empty && empty.classList.add("hidden");

  const list = (Array.isArray(rows) ? rows : [])
    .filter(r => Number(r.balance ?? 0) > 0)
    .sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0));

  if (!list.length) {
    if (empty) empty.classList.remove("hidden");
    return;
  }

  for (const r of list) {
    const tenant = r.tenant ?? "—";
    const bal    = Number(r.balance ?? 0);
    const pct    = Number(r.collection_rate_pct ?? 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(tenant)}</td>
      <td style="text-align:right">${fmtKes(bal)}</td>
      <td style="text-align:right">${fmtPct(pct)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setLastUpdatedBalances() {
  const now = new Date().toLocaleString("en-KE");
  setText("#balancesLastUpdated", `Last updated: ${now}`);
  setText("#outstandingLastUpdated", `Last updated: ${now}`);
}

/* -------- balances CSV export (ALWAYS works) -------- */
async function exportBalancesCsv() {
  const month = getSelectedMonth();
  const base = state.apiBase.replace(/\/+$/, "");
  const candidates = [
    `${base}/dashboard/balances/export?month=${encodeURIComponent(month)}`,
    `${base}/balances/export?month=${encodeURIComponent(month)}`,
  ];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `balances_${month}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Export failed");
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

  const ym = state.currentMonth || yyyymm();
  if (!state.currentMonth) setCurrentMonth(ym, { triggerReload: false });

  try {
    const [leases, payments, rentRollResp, dash] = await Promise.all([
      apiGet("/leases?limit=1000"),
      apiGet(`/payments?month=${encodeURIComponent(ym)}`),
      apiGet(`/rent-roll?month=${encodeURIComponent(ym)}`),
      apiGet(`/dashboard/overview?month=${encodeURIComponent(ym)}`),
    ]);

    const rentRoll = rentRollResp && rentRollResp.data ? rentRollResp.data : [];

    if (kpiLeases) kpiLeases.textContent = leases.length ?? 0;

    const openCount = rentRoll.filter((r) => (r.status || "").toLowerCase() !== "paid").length;
    if (kpiOpen) kpiOpen.textContent = openCount;

    const paymentsTotal = (payments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    if (kpiPayments) kpiPayments.textContent = fmtKes(paymentsTotal);

    if (kpiBalance) kpiBalance.textContent = fmtKes(dash.balance_total ?? dash.total_outstanding ?? 0);

    const monthLabel = formatMonthLabel(dash.month_start || ym);
    if (labelEl) labelEl.textContent = monthLabel;

    const totalDue  = dash.total_due ?? dash.rent_due_total ?? dash.rent_subtotal_total ?? 0;
    const totalPaid = dash.total_paid ?? dash.amount_paid_total ?? 0;
    const balance   = dash.balance_total ?? dash.total_outstanding ?? 0;
    const rate      = dash.collection_rate_pct ?? (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0);

    if (dueEl)  dueEl.textContent  = `${fmtKes(totalDue)} invoiced`;
    if (collEl) collEl.textContent = `${fmtKes(totalPaid)} collected`;
    if (balEl)  balEl.textContent  = `${fmtKes(balance)} outstanding`;
    if (rateEl) rateEl.textContent = `${fmtPct(rate)} collection rate`;
  } catch (err) {
    console.error("loadOverview error:", err);
    if (kpiLeases)   kpiLeases.textContent   = "—";
    if (kpiOpen)     kpiOpen.textContent     = "—";
    if (kpiPayments) kpiPayments.textContent = "—";
    if (kpiBalance)  kpiBalance.textContent  = "—";
    if (labelEl)     labelEl.textContent     = "Error loading";
  }
}

async function loadLeases() {
  const body = $("#leasesBody");
  const empty = $("#leasesEmpty");
  const searchTerm = ($("#leaseSearch")?.value || "").trim().toLowerCase();

  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  try {
    const leases = await apiGet("/leases?limit=1000");
    const rows = (leases || []).filter((l) => {
      if (!searchTerm) return true;
      const t = (l.tenant || "").toLowerCase();
      const u = (l.unit || "").toLowerCase();
      return t.includes(searchTerm) || u.includes(searchTerm);
    });

    if (!rows.length) {
      empty && empty.classList.remove("hidden");
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
          <button class="btn ghost btn-wa-lease" data-lease-id="${r.lease_id}" type="button">
            WhatsApp
          </button>
        </td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadLeases error:", err);
    if (empty) {
      empty.textContent = "Error loading leases.";
      empty.classList.remove("hidden");
    }
  }
}

async function loadPayments(initial = false) {
  const monthSelect = $("#paymentsMonth");
  const tenantFilter = ($("#paymentsTenant")?.value || "").trim().toLowerCase();
  const statusFilter = ($("#paymentsStatus")?.value || "").trim().toLowerCase();
  const body = $("#paymentsBody");
  const empty = $("#paymentsEmpty");

  const countChip = $("#paymentsCountChip");
  const totalChip = $("#paymentsTotalChip");

  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  if (countChip) countChip.textContent = "0";
  if (totalChip) totalChip.textContent = fmtKes(0);

  try {
    if (initial && monthSelect) {
      const raw = await apiGetFirst(["/payments/months", "/months"]);
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      let months = rows
        .map(r => (typeof r === "string" ? r : (r?.ym || r?.month)))
        .filter(Boolean);

      months = Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));

      monthSelect.innerHTML = "";

      if (state.currentMonth && !months.includes(state.currentMonth)) months.unshift(state.currentMonth);
      if (!months.length && state.currentMonth) months.push(state.currentMonth);

      for (const ym of months) {
        const opt = document.createElement("option");
        opt.value = ym;
        opt.textContent = formatMonthLabel(ym);
        monthSelect.appendChild(opt);
      }

      monthSelect.value = state.currentMonth || months[0] || yyyymm();
      wireMonthSelect(monthSelect);
    }

    const month = (monthSelect?.value || state.currentMonth);
    if (month && month !== state.currentMonth) setCurrentMonth(month, { triggerReload: false });

    const payments = await apiGet(`/payments?month=${encodeURIComponent(month)}`);

    const filtered = (payments || []).filter((p) => {
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

    const totalPaid = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (countChip) countChip.textContent = String(filtered.length);
    if (totalChip) totalChip.textContent = fmtKes(totalPaid);

    if (!filtered.length) {
      empty && empty.classList.remove("hidden");
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
    if (empty) {
      empty.textContent = "Error loading payments.";
      empty.classList.remove("hidden");
    }
  }
}

async function loadRentRoll(initial = false) {
  const monthSelect = $("#rentrollMonth");
  const tenantFilter = ($("#rentrollTenant")?.value || "").trim().toLowerCase();
  const propertyFilter = ($("#rentrollProperty")?.value || "").trim().toLowerCase();
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");
  const countChip = $("#rentrollCount");

  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");
  if (countChip) countChip.textContent = "—";

  try {
    const needMonths = !!monthSelect && monthSelect.options.length === 0;
    if ((initial || needMonths) && monthSelect) {
      const raw = await apiGet("/months");
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      const months = rows.map(r => (typeof r === "string" ? r : r?.ym)).filter(Boolean);

      monthSelect.innerHTML = "";

      if (state.currentMonth && !months.includes(state.currentMonth)) months.unshift(state.currentMonth);
      if (!months.length && state.currentMonth) months.push(state.currentMonth);
      if (!months.length) months.push(yyyymm());

      for (const ym of months) {
        const opt = document.createElement("option");
        opt.value = ym;
        opt.textContent = formatMonthLabel(ym);
        monthSelect.appendChild(opt);
      }

      monthSelect.value = state.currentMonth || months[0] || yyyymm();
      wireMonthSelect(monthSelect);
    }

    let month = (monthSelect?.value || state.currentMonth || yyyymm());
    if (month && month !== state.currentMonth) setCurrentMonth(month, { triggerReload: false });

    const resp = await apiGet(`/rent-roll?month=${encodeURIComponent(month)}`);
    const rows = resp?.data ?? (Array.isArray(resp) ? resp : []);

    const filtered = (rows || []).filter((r) => {
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

    if (countChip) countChip.textContent = String(filtered.length);

    if (!filtered.length) {
      empty && empty.classList.remove("hidden");
      return;
    }

    for (const r of filtered) {
      const period = r.period_start
        ? formatMonthLabel(String(r.period_start).slice(0, 7))
        : "";

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
          <span class="status ${status === "paid" ? "ok" : "due"}">
            ${status || "—"}
          </span>
        </td>
        <td style="text-align:right">${fmtKes(balance)}</td>
        <td>
          <button class="btn ghost btn-wa-rentroll" data-lease-id="${r.lease_id}" type="button">
            WhatsApp
          </button>
        </td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadRentRoll error:", err);
    if (countChip) countChip.textContent = "0";
    if (empty) {
      empty.textContent = "Error loading rent-roll.";
      empty.classList.remove("hidden");
    }
  }
}

/* --------------------------------------------------------------------------
 * Balances loader (overview + by_tenant + outstanding derived)
 * -------------------------------------------------------------------------- */
async function loadBalances() {
  const month = getSelectedMonth();
  console.log("[BALDBG] loadBalances:", { month });

  try {
    const overview = await apiGetFirst([
      `/dashboard/balances/overview?month=${encodeURIComponent(month)}`,
      `/balances/overview?month=${encodeURIComponent(month)}`,
    ]);
    renderBalancesOverview(overview);

    const byTenant = await apiGetFirst([
      `/dashboard/balances/by_tenant?month=${encodeURIComponent(month)}`,
      `/balances/by_tenant?month=${encodeURIComponent(month)}`,
    ]);

    const rows = Array.isArray(byTenant?.rows) ? byTenant.rows : [];
    renderBalancesByTenantTable(rows);

    setText("#outstandingMonthLabel", formatMonthLabel(month));
    renderOutstandingTable(rows);

    setLastUpdatedBalances();
  } catch (err) {
    console.error("[BALDBG] loadBalances error:", err);

    // Safe reset so UI doesn't show stale/blank weirdness
    renderBalancesOverview({ month_start: month + "-01", total_due: 0, total_paid: 0, balance_total: 0, collection_rate_pct: 0 });
    renderBalancesByTenantTable([]);
    renderOutstandingTable([]);
    setLastUpdatedBalances();
  }
}

/* --------------------------------------------------------------------------
 * Optional balances by unit (only if you add HTML later)
 * -------------------------------------------------------------------------- */
async function loadBalancesByUnit() {
  const body = $("#balancesByUnitBody");
  const empty = $("#balancesByUnitEmpty");
  if (!body) return;

  body.innerHTML = "";
  if (empty) empty.classList.add("hidden");

  const ym = $("#balancesMonth")?.value || state.currentMonth || yyyymm();

  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  try {
    const resp = await apiGetFirst([
      `/balances/by-unit?month=${encodeURIComponent(ym)}`,
      `/balances/by_unit?month=${encodeURIComponent(ym)}`,
      `/balances/byunit?month=${encodeURIComponent(ym)}`,
    ]);

    const rows = resp?.data ?? (Array.isArray(resp) ? resp : []);
    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) {
      if (empty) empty.classList.remove("hidden");
      return;
    }

    for (const r of list) {
      const property = r.property_name || r.property || "";
      const unit = r.unit_code || r.unit || "";
      const tenant = r.tenant || r.tenant_name || "";

      const due = r.due ?? r.total_due ?? r.rent_due;
      const paid = r.paid ?? r.total_paid ?? r.amount_paid;
      const bal = r.balance ?? r.outstanding ?? 0;

      const rate =
        r.collection_rate ??
        r.rate ??
        (toNum(due) > 0 ? (toNum(paid) / toNum(due)) * 100 : 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${property}</td>
        <td>${unit}</td>
        <td>${tenant}</td>
        <td class="num">${fmtKes(toNum(due))}</td>
        <td class="num">${fmtKes(toNum(paid))}</td>
        <td class="num">${fmtKes(toNum(bal))}</td>
        <td class="num">${fmtPct(rate)}</td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadBalancesByUnit error:", err);
    if (empty) {
      empty.textContent = "Error loading balances-by-unit.";
      empty.classList.remove("hidden");
    }
  }
}

/* -------- WhatsApp ad-hoc builder -------- */
function initWhatsAppBuilder() {
  const btn = $("#waBuild");
  const out = $("#waResult");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const tenant = ($("#waTenant")?.value || "tenant").trim();
    const period = ($("#waPeriod")?.value || "this period").trim();
    const balNum = Number($("#waBalance")?.value || 0);
    const rawPhone = ($("#waPhone")?.value || "").trim();

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
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msgLines.join("\n"))}`;
    out.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open WhatsApp link</a>`;
  });
}

/* -------- Invoice actions (top bar) -------- */
function initInvoiceActions() {
  const healthBtn = $("#btnHealth");
  const markBtn = $("#btnMarkSent");
  const input = $("#invoiceIdInput");
  const msg = $("#actionMsg");

  const setMsg = (t) => { if (msg) msg.textContent = t; };

  if (healthBtn) {
    healthBtn.addEventListener("click", async () => {
      setMsg("Checking admin token…");
      try {
        const headers = {};
        const t = getAdminTokenFromStorage();
        if (t) headers["X-Admin-Token"] = t;

        const base = (state.apiBase || "").replace(/\/+$/, "");
        const res = await fetch(base + "/admin/ping", { headers });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${body}`);
        }

        setMsg("Admin token OK ✅");
      } catch (err) {
        console.error("auth ping error:", err);
        setMsg("Admin token failed ❌ – check value in Settings.");
      }
    });
  }

  if (markBtn) {
    markBtn.addEventListener("click", async () => {
      const id = (input?.value || "").trim();
      if (!id) {
        setMsg("Enter invoice_id (UUID) first.");
        return;
      }
      setMsg("Marking invoice as sent…");

      try {
        const data = await apiPost(
          "/invoices/mark_sent",
          { invoice_ids: [id], sent_via: "whatsapp", sent_to: "tenant" },
          { admin: true }
        );
        setMsg(`Marked sent: ${(data.updated || []).join(", ")}`);
      } catch (err) {
        console.error("mark_sent error:", err);
        setMsg("Error marking invoice as sent.");
      }
    });
  }
}

/* -------- export helpers -------- */
function initExports() {
  const btn = $("#btnExportBalances");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      await exportBalancesCsv();
    } catch (err) {
      console.error("exportBalancesCsv error:", err);
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
      tabs.forEach((t) => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
      const panels = ["overview","leases","payments","rentroll","balances","whatsapp","settings"];
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
      const v = (apiInput?.value || "").trim();
      if (v) {
        state.apiBase = v.replace(/\/+$/, "");
        localStorage.setItem("api_base", state.apiBase);
        if (apiInput2) apiInput2.value = state.apiBase;
      }
    });
  }

  if (saveSettings) {
    saveSettings.addEventListener("click", () => {
      const base = (apiInput2?.value || "").trim();
      const admin = (adminInput?.value || "").trim();
      if (base) {
        state.apiBase = base.replace(/\/+$/, "");
        localStorage.setItem("api_base", state.apiBase);
        if (apiInput) apiInput.value = state.apiBase;
      }
      if (admin) localStorage.setItem("admin_token", admin);
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

/* WhatsApp buttons in leases & rent-roll (now includes selected month) */
function initRowWhatsAppButtons() {
  document.addEventListener("click", (ev) => {
    const month = state.currentMonth || yyyymm();
    const base = (state.apiBase || "").replace(/\/+$/, "");

    // 1) RENT ROLL WhatsApp -> NEW endpoint
    const rrBtn = ev.target.closest(".btn-wa-rentroll");
    if (rrBtn) {
      const leaseId = rrBtn.dataset.leaseId;
      if (!leaseId) return;

      const url =
        base +
        `/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(
          leaseId
        )}&month=${encodeURIComponent(month)}`;

      window.open(url, "_blank", "noopener");
      return;
    }

    // 2) LEASES WhatsApp -> Existing endpoint
    const leaseBtn = ev.target.closest(".btn-wa-lease");
    if (leaseBtn) {
      const leaseId = leaseBtn.dataset.leaseId;
      if (!leaseId) return;

      const url =
        base +
        `/wa_for_lease_redirect?lease_id=${encodeURIComponent(
          leaseId
        )}&month=${encodeURIComponent(month)}`;

      window.open(url, "_blank", "noopener");
      return;
    }
  });
}

/* --------------------------------------------------------------------------
 * Month picker (global) — MUST set state.currentMonth
 * -------------------------------------------------------------------------- */
async function initMonthPicker() {
  const raw = await apiGet("/months");
  const months = Array.isArray(raw) ? raw : (raw?.data || []);

  function fillSelect(selectId, values) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    for (const ym of values) {
      const opt = document.createElement("option");
      opt.value = ym;
      opt.textContent = formatMonthLabel(ym);
      sel.appendChild(opt);
    }
  }

  fillSelect("paymentsMonth", months);
  fillSelect("rentrollMonth", months);
  fillSelect("balancesMonth", months);

  const defaultMonth = months?.[0] || yyyymm();

  ["paymentsMonth", "rentrollMonth", "balancesMonth"].forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = defaultMonth;
  });

  setCurrentMonth(defaultMonth, { triggerReload: false });

  wireMonthSelect(document.getElementById("paymentsMonth"));
  wireMonthSelect(document.getElementById("rentrollMonth"));
  wireMonthSelect(document.getElementById("balancesMonth"));
}

/* -------- initial load -------- */
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initApiBaseControls();
  initWhatsAppBuilder();
  initInvoiceActions();
  initExports();
  initRowWhatsAppButtons();

  try {
    await initMonthPicker();
  } catch (e) {
    console.error("initMonthPicker failed:", e);
    setCurrentMonth(yyyymm(), { triggerReload: false });
  }

  loadOverview();
  loadLeases();
  loadPayments(true);
  loadRentRoll(true);
  loadBalances();
  loadBalancesByUnit();

  $("#reloadLeases")?.addEventListener("click", loadLeases);

  $("#reloadBalances")?.addEventListener("click", () => {
    loadBalances();
    loadBalancesByUnit();
  });

  $("#reloadOutstandingByTenant")?.addEventListener("click", () => loadBalances());

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
