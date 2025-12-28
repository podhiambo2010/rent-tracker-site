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

function fmtKesAbs(n) {
  const x = Number(n) || 0;
  return `KES ${fmtNumber(Math.abs(x))}`;
}

// Shows "KES 372,531 CR" when negative, otherwise "KES 372,531"
function fmtKesCR(n, suffix = "CR") {
  const x = Number(n) || 0;
  if (x < 0) return `KES ${fmtNumber(Math.abs(x))} ${suffix}`;
  return `KES ${fmtNumber(x)}`;
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

function fmtKesCr(n) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "KES 0";
  return x < 0 ? `${fmtKes(Math.abs(x))} CR` : fmtKes(x);
}

/* -------- credit/over-collection display helpers -------- */
function splitBalance(balance) {
  const b = Number(balance) || 0;
  if (b < 0) return { kind: "credit", amount: Math.abs(b) };
  return { kind: "outstanding", amount: b };
}

function fmtBalanceStatus(balance) {
  const x = splitBalance(balance);
  return x.kind === "credit"
    ? `${fmtKes(x.amount)} credit`
    : `${fmtKes(x.amount)} outstanding`;
}

function fmtKpiBalance(balance) {
  const x = splitBalance(balance);
  return x.kind === "credit"
    ? `${fmtKes(x.amount)} CR`
    : fmtKes(x.amount);
}

function fmtRateStatus(ratePct) {
  const r = Number(ratePct) || 0;
  if (r > 100) return `${fmtPct(r)} over-collected`;
  return `${fmtPct(r)} collection rate`;
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
  return (localStorage.getItem("admin_token") || "").trim();
}

// ✅ FIX: define authHeaders (your code calls it but it was missing)
function authHeaders(extra = {}) {
  const h = { ...extra };
  const token = getAdminTokenFromStorage();
  if (token) {
    // keep the header name you’ve been using
    h["x-admin-token"] = token;
  }
  return h;
}

async function apiGet(path, opts = {}) {
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is not set");

  const url = base + path;

  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({ Accept: "application/json" }),
  });

  // ✅ IMPORTANT: 404 for “no data” months should not break UI
  if (opts.allow404 && res.status === 404) {
    return opts.fallback ?? [];
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}${txt ? " | " + txt : ""}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
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

/* ---------------------------------------------------------------------------
   PAYMENTS TAB: Adapter to prevent "loadPayments is not defined"
   and to ensure Payments always loads even if the underlying fn name differs.
   Paste this block BEFORE DOMContentLoaded and BEFORE reloadAllMonthViews().
--------------------------------------------------------------------------- */

function getPaymentsTbody() {
  return (
    document.querySelector("#paymentsTable tbody") ||
    document.querySelector("#paymentsTbody") ||
    document.querySelector("#payments tbody") ||
    document.querySelector("table[data-table='payments'] tbody") ||
    document.querySelector("table#payments tbody") ||
    null
  );
}

function showPaymentsPlaceholder(msg) {
  const tbody = getPaymentsTbody();
  if (!tbody) return;
  const safe = (typeof escapeHtml === "function") ? escapeHtml(String(msg)) : String(msg);
  // Try to span a reasonable number of columns (fallback 6)
  const cols =
    tbody.closest("table")?.querySelectorAll("thead th")?.length ||
    tbody.closest("table")?.rows?.[0]?.cells?.length ||
    6;

  tbody.innerHTML = `<tr><td colspan="${cols}">${safe}</td></tr>`;
}

/**
 * Finds whichever payments loader exists in your app.
 * We DO NOT rename your internal code — we just adapt safely.
 */
function resolvePaymentsLoaderFn() {
  const candidates = [
    "loadPayments",      // ideal / expected
    "paymentsLoader",    // seen in your console warning
    "loadPayment",       // older pattern
    "loadPaymentsTable",
    "loadPaymentsRows",
  ];
  for (const name of candidates) {
    if (typeof window[name] === "function") return window[name];
  }
  return null;
}

/**
 * Global loadPayments(force=true/false) — always available.
 * If your project already has loadPayments, we won't override it.
 */
if (typeof window.loadPayments !== "function") {
  window.loadPayments = async function loadPayments(force = false) {
    const fn = resolvePaymentsLoaderFn();

    if (!fn) {
      console.warn(
        "Payments loader not found (loadPayments/paymentsLoader/loadPayment) — skipping"
      );
      showPaymentsPlaceholder("Payments loader missing in app.js (no data loaded).");
      return;
    }

    try {
      const res = fn(force);
      // Support both sync + async loaders
      const out = (res && typeof res.then === "function") ? await res : res;

      // If your loader doesn't render anything when empty, ensure user sees something.
      const tbody = getPaymentsTbody();
      if (tbody && !tbody.innerHTML.trim()) {
        showPaymentsPlaceholder("No payments found for this month.");
      }
      return out;
    } catch (e) {
      console.error("loadPayments(adapter) failed:", e);
      showPaymentsPlaceholder("Error loading payments.");
    }
  };
}

/* ---------------------------------------------------------------------------
   SAFE month reload — prevents one broken loader from breaking other tabs.
   Replace your existing reloadAllMonthViews() with this block.
--------------------------------------------------------------------------- */
function reloadAllMonthViews(opts = { initial: false }) {
  const safeCall = (fnName, fn, ...args) => {
    if (typeof fn === "function") return fn(...args);
    console.warn(`${fnName} is not defined — skipping`);
  };

  // Always keep month in sync first (if these exist)
  try {
    const ym =
      (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
      state?.currentMonth ||
      (typeof yyyymm === "function" ? yyyymm() : null);

    if (ym && typeof setCurrentMonth === "function") {
      setCurrentMonth(ym, { triggerReload: false });
    }
  } catch (e) {
    console.warn("reloadAllMonthViews month sync warning:", e);
  }

  // Now reload each view safely (one failing does NOT kill others)
  safeCall("loadOverview()", window.loadOverview);
  safeCall("loadLeases()", window.loadLeases);
  safeCall("loadPayments(true)", window.loadPayments, true);
  safeCall("loadRentRoll(true)", window.loadRentRoll, true);
  safeCall("loadBalances()", window.loadBalances);
  safeCall("loadBalancesByUnit()", window.loadBalancesByUnit);
}

/* -------- month selection setter (single source of truth) -------- */
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

/* -------- month selection helper (single source of truth) -------- */
function getSelectedMonth() {
  return (
    $("#monthPicker")?.value ||          // if you have the global month input
    $("#balancesMonth")?.value ||
    $("#paymentsMonth")?.value ||
    $("#rentrollMonth")?.value ||
    state.currentMonth ||
    yyyymm()
  );
}

/* -------- Balances renderers (MATCH YOUR HTML IDs) -------- */
function renderBalancesOverview(o) {
  const data = (o && typeof o === "object" && "data" in o) ? o.data : o;

  const monthStart =
    data?.month_start ||
    data?.month ||
    (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
    state.currentMonth ||
    yyyymm();

  const ym = String(monthStart).slice(0, 7);
  const monthLabel = formatMonthLabel(ym);

  const totalDue  = Number(data?.total_due ?? data?.rent_due_total ?? data?.rent_subtotal_total ?? 0);
  const totalPaid = Number(data?.total_paid ?? data?.paid_total ?? data?.amount_paid_total ?? data?.collected_amt ?? 0);
  const balTotal  = Number(data?.balance_total ?? data?.total_outstanding ?? data?.balance ?? 0);

  const cr = Number(
    data?.collection_rate_pct ??
    (totalDue > 0 ? (totalPaid / totalDue) * 100 : 0)
  );

  setText("#balMonthLabel", monthLabel);
  setText("#balMonthDue", `${fmtKes(totalDue)} due`);
  setText("#balMonthCollected", `${fmtKes(totalPaid)} collected`);

  if (balTotal < 0) {
    setText("#balMonthBalance", `${fmtKesAbs(balTotal)} credit`);
    setText("#balMonthRate", `${fmtPct(cr)} over-collected`);
  } else {
    setText("#balMonthBalance", `${fmtKes(balTotal)} balance`);
    setText("#balMonthRate", `${fmtPct(cr)} collection rate`);
  }
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
    const due    = Number(r.total_due ?? r.rent_due ?? r.invoiced_amt ?? 0);
    const paid   = Number(r.total_paid ?? r.paid_total ?? r.collected_amt ?? r.amount_paid ?? 0);
    const bal    = Number(r.balance ?? r.balance_total ?? r.total_outstanding ?? 0);
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
    .filter(r => Number(r.balance ?? r.balance_total ?? r.total_outstanding ?? 0) > 0)
    .sort((a, b) => Number(b.balance ?? b.balance_total ?? 0) - Number(a.balance ?? a.balance_total ?? 0));

  if (!list.length) {
    if (empty) empty.classList.remove("hidden");
    return;
  }

  for (const r of list) {
    const tenant = r.tenant ?? "—";
    const bal    = Number(r.balance ?? r.balance_total ?? r.total_outstanding ?? 0);

    // Use provided pct if present; else compute if we have due/paid
    const due = Number(r.total_due ?? r.rent_due ?? 0);
    const paid = Number(r.total_paid ?? r.paid_total ?? 0);
    const pct = Number(r.collection_rate_pct ?? (due > 0 ? (paid / due) * 100 : 0));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(tenant)}</td>
      <td style="text-align:right">${fmtKes(bal)}</td>
      <td style="text-align:right">${fmtPct(pct)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderDunningTable(rows) {
  const tbody = $("#dunningBody");
  const empty = $("#dunningEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";
  empty && empty.classList.add("hidden");

  const list = (Array.isArray(rows) ? rows : [])
    .filter(r => Number(r.balance ?? r.balance_total ?? r.total_outstanding ?? 0) > 0)
    .sort((a, b) => Number(b.balance ?? b.balance_total ?? 0) - Number(a.balance ?? a.balance_total ?? 0));

  if (!list.length) {
    if (empty) empty.classList.remove("hidden");
    return;
  }

  for (const r of list) {
    const tenant = r.tenant ?? "—";
    const bal    = Number(r.balance ?? r.balance_total ?? r.total_outstanding ?? 0);

    const due = Number(r.total_due ?? r.rent_due ?? 0);
    const paid = Number(r.total_paid ?? r.paid_total ?? 0);
    const pct = Number(r.collection_rate_pct ?? (due > 0 ? (paid / due) * 100 : 0));

    const unit = r.unit_code || r.unit || "";

    const tr = document.createElement("tr");

    const tdTenant = document.createElement("td");
    tdTenant.textContent = unit ? `${tenant} (${unit})` : tenant;

    const tdBal = document.createElement("td");
    tdBal.style.textAlign = "right";
    tdBal.textContent = fmtKes(bal);

    const tdPct = document.createElement("td");
    tdPct.style.textAlign = "right";
    tdPct.textContent = fmtPct(pct);

    const tdAction = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.type = "button";
    btn.textContent = "WhatsApp";
    btn.dataset.dunTenant = String(tenant);
    btn.dataset.dunBalance = String(bal);
    tdAction.appendChild(btn);

    tr.appendChild(tdTenant);
    tr.appendChild(tdBal);
    tr.appendChild(tdPct);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  }
}

function setLastUpdatedBalances() {
  const now = new Date().toLocaleString("en-KE");
  setText("#balancesLastUpdated", `Last updated: ${now}`);
  setText("#outstandingLastUpdated", `Last updated: ${now}`);

  // Safe: only updates if Dunning exists
  setText("#dunningLastUpdated", `Last updated: ${now}`);
}

/* -------- core loaders -------- */
async function loadOverview() {
  const kpiLeases   = $("#kpiLeases");
  const kpiOpen     = $("#kpiOpen");
  const kpiPayments = $("#kpiPayments");
  const kpiBalance  = $("#kpiBalance");

  const summaryWrap = $("#collection-summary-month");

  const ym =
    (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
    state.currentMonth ||
    yyyymm();

  if (state.currentMonth !== ym && typeof setCurrentMonth === "function") {
    setCurrentMonth(ym, { triggerReload: false });
  }

  const fmtDrCr = (n) => {
    const x = Number(n) || 0;
    if (x < 0) return `${fmtKes(Math.abs(x))} CR`;
    if (x > 0) return `${fmtKes(x)} DR`;
    return `${fmtKes(0)}`;
  };

  const safeGet = async (fn, fallback) => {
    try { return await fn(); }
    catch (e) { console.warn("Overview safeGet:", e); return fallback; }
  };

  const apiGetFirst = async (paths) => {
    let lastErr = null;
    for (const p of paths) {
      try {
        const r = await apiGet(p);
        if (r != null) return r;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("All fallback endpoints failed");
  };

  try {
    // Single source of truth: balances overview
    const balOv = await apiGetFirst([
      `/dashboard/balances/overview?month=${encodeURIComponent(ym)}`,
      `/balances/overview?month=${encodeURIComponent(ym)}`
    ]);

    const data = (balOv && typeof balOv === "object" && "data" in balOv) ? balOv.data : balOv;

    // Optional helpers for KPIs
    const leasesResp = await safeGet(() => apiGet("/leases?limit=1000"), []);
    const leases = Array.isArray(leasesResp?.data) ? leasesResp.data : (Array.isArray(leasesResp) ? leasesResp : []);

    const rrResp = await safeGet(() => apiGet(`/rent-roll?month=${encodeURIComponent(ym)}`), null);
    const rentRoll = rrResp?.data || rrResp || [];

    if (kpiLeases) kpiLeases.textContent = leases.length;

    const openCount = Array.isArray(rentRoll)
      ? rentRoll.filter((r) => (r.status || "").toLowerCase() !== "paid").length
      : 0;
    if (kpiOpen) kpiOpen.textContent = openCount;

    // Core values
    const openingCR = Number(data?.opening_credit_total ?? 0);
    const openingDR = Number(data?.opening_debit_total ?? 0);

    const invoiced  = Number(data?.total_due ?? 0);
    const collected = Number(data?.cash_collected_total ?? data?.total_paid ?? 0);

    const closing   = Number(data?.closing_balance_total ?? data?.balance_total ?? 0);

    // Match your UI label: "Invoiced − Collected"
    const movement = invoiced - collected;

    // Rates
    const rawRate = invoiced > 0 ? (collected / invoiced) * 100 : 0;
    const collectionRate = Math.min(100, rawRate);
    const overPct = Math.max(0, rawRate - 100);

    const rateText = overPct > 0
      ? `${fmtPct(collectionRate)} collected • ${fmtPct(overPct)} over-collected`
      : `${fmtPct(collectionRate)} collection rate`;

    // KPIs
    if (kpiPayments) kpiPayments.textContent = fmtKes(collected);
    if (kpiBalance)  kpiBalance.textContent  = fmtDrCr(closing);

    // Monthly collection summary cards (grid)
    if (summaryWrap) {
      summaryWrap.innerHTML = `
        <div class="sum-card">
          <div class="sum-title">B/F (Opening)</div>
          <div class="sum-value">KES ${fmtNumber(openingCR)} CR / KES ${fmtNumber(openingDR)} DR</div>
        </div>

        <div class="sum-card">
          <div class="sum-title">Invoiced (month)</div>
          <div class="sum-value">${fmtKes(invoiced)}</div>
        </div>

        <div class="sum-card">
          <div class="sum-title">Collected (month)</div>
          <div class="sum-value">${fmtKes(collected)}</div>
          <div class="sum-sub">Cash collected (paid_at)</div>
        </div>

        <div class="sum-card">
          <div class="sum-title">Net movement (month)</div>
          <div class="sum-value">${fmtDrCr(movement)}</div>
          <div class="sum-sub">Invoiced − Collected</div>
        </div>

        <div class="sum-card">
          <div class="sum-title">Closing balance</div>
          <div class="sum-value">${fmtDrCr(closing)}</div>
        </div>

        <div class="sum-card">
          <div class="sum-title">Collection rate</div>
          <div class="sum-value">${rateText}</div>
        </div>
      `;
    }

    // Make sure duplicate label is hidden (in case DOM changed)
    ensureUiTweaks();

  } catch (err) {
    console.error("loadOverview error:", err);
    if (kpiLeases)   kpiLeases.textContent   = "—";
    if (kpiOpen)     kpiOpen.textContent     = "—";
    if (kpiPayments) kpiPayments.textContent = "—";
    if (kpiBalance)  kpiBalance.textContent  = "—";
    if (summaryWrap) summaryWrap.innerHTML = `<div class="sum-card"><strong>Error loading</strong></div>`;
  }
}

// --- Rent roll tab ---
async function loadRentRoll(initial = false) {
  const monthSelect = $("#rentrollMonth");
  const tenantFilter = ($("#rentrollTenant")?.value || "").trim().toLowerCase();
  const propertyFilter = ($("#rentrollProperty")?.value || "").trim().toLowerCase();
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");

  // count chip in the Rent Roll header (sometimes shows '-' from HTML)
  const countChip = $("#rentrollCount") || $("#rentrollCountChip");

  // totals chips
  const dueChip = $("#rentrollDueChip");
  const paidChip = $("#rentrollPaidChip");
  const balChip = $("#rentrollBalChip");
  const creditChip = $("#rentrollCreditChip");

  if (!body) return;

  // Always clear table immediately (prevents duplicates)
  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  // HARD RESET: overwrite any '-' immediately
  if (countChip) countChip.textContent = "0";
  if (dueChip) dueChip.textContent = `${fmtKes(0)} due`;
  if (paidChip) paidChip.textContent = `${fmtKes(0)} paid`;
  if (balChip) balChip.textContent = `${fmtKes(0)} balance`;
  if (creditChip) creditChip.textContent = `${fmtKes(0)} credit`;

  try {
    // months dropdown init (keep your existing logic)
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

    const month = (monthSelect?.value || state.currentMonth || yyyymm());
    if (month && month !== state.currentMonth) setCurrentMonth(month, { triggerReload: false });

    const resp = await apiGet(`/rent-roll?month=${encodeURIComponent(month)}`);
    const rows = resp?.data ?? (Array.isArray(resp) ? resp : []);

    const filtered = (rows || []).filter((r) => {
      if (tenantFilter) {
        const t = String(r.tenant || r.tenant_name || "").toLowerCase();
        if (!t.includes(tenantFilter)) return false;
      }
      if (propertyFilter) {
        const p = String(r.property_name || r.property || "").toLowerCase();
        if (!p.includes(propertyFilter)) return false;
      }
      return true;
    });

    // ---- totals helpers ----
    const rowCredit = (r) => moneyToNumber(r.credits ?? r.credit ?? 0);

    const rowDue = (r) => {
      // prefer total_due if provided and non-zero
      const td = moneyToNumber(r.total_due ?? 0);
      if (td) return td;

      const base = moneyToNumber(r.subtotal_rent ?? r.rent ?? r.rent_due ?? 0);
      const late = moneyToNumber(r.late_fees ?? 0);
      const cred = rowCredit(r);
      return base + late - cred;
    };

    const rowBal = (r) =>
      moneyToNumber(r.balance ?? r.invoice_balance ?? r.month_delta ?? 0);

    const rowPaid = (r) => {
      // if backend provides paid_total etc use it
      const explicit = moneyToNumber(r.paid_total ?? r.paid ?? r.collected_amt ?? 0);
      if (explicit) return explicit;

      // else infer: paid = due - balance (never negative)
      const due = rowDue(r);
      const bal = rowBal(r);
      return Math.max(0, due - bal);
    };

    // ---- update chips ----
    if (countChip) countChip.textContent = String(filtered.length);

    const totalDue = sum(filtered, rowDue);
    const totalPaid = sum(filtered, rowPaid);
    const totalBal = sum(filtered, rowBal);
    const totalCredit = sum(filtered, rowCredit);

    if (dueChip) dueChip.textContent = `${fmtKes(totalDue)} due`;
    if (paidChip) paidChip.textContent = `${fmtKes(totalPaid)} paid`;
    if (balChip) balChip.textContent = `${fmtKes(totalBal)} balance`;
    if (creditChip) creditChip.textContent = `${fmtKes(totalCredit)} credit`;

    if (!filtered.length) {
      empty && empty.classList.remove("hidden");
      return;
    }

    // ---- render table ----
    const frag = document.createDocumentFragment();

    for (const r of filtered) {
      const period =
        r.period_start
          ? formatMonthLabel(String(r.period_start).slice(0, 7))
          : (r.period || "—");

      const baseRent = moneyToNumber(r.subtotal_rent ?? r.rent ?? r.rent_due ?? 0);
      const lateFees = moneyToNumber(r.late_fees ?? 0);
      const status = String(r.status ?? r.invoice_status ?? "—").toLowerCase();
      const balance = rowBal(r);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.property_name || r.property || "—"}</td>
        <td>${r.unit_code || r.unit || "—"}</td>
        <td>${r.tenant || r.tenant_name || "—"}</td>
        <td>${period}</td>
        <td>${fmtKes(baseRent)}</td>
        <td>${lateFees ? fmtKes(lateFees) : "—"}</td>
        <td>
          <span class="status ${status === "paid" ? "ok" : "due"}">
            ${status || "—"}
          </span>
        </td>
        <td style="text-align:right">${fmtKes(balance)}</td>
        <td>
          <button class="btn ghost btn-wa-rentroll" data-lease-id="${r.lease_id || ""}" type="button">
            WhatsApp
          </button>
        </td>
      `;
      frag.appendChild(tr);
    }

    body.appendChild(frag);

  } catch (err) {
    console.error("loadRentRoll error:", err);
    body.innerHTML = "";
    empty && empty.classList.remove("hidden");

    // ensure header never stays as '-'
    if (countChip) countChip.textContent = "0";
  }
}

/* --------------------------------------------------------------------------
 * Balances loader (overview + by_tenant + outstanding derived)
 * -------------------------------------------------------------------------- */
async function loadBalances() {
  const month =
    (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
    state.currentMonth ||
    yyyymm();

  // keep state aligned (no reload loop)
  if (state.currentMonth !== month) {
    setCurrentMonth(month, { triggerReload: false });
  }

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

    const rows = Array.isArray(byTenant?.rows) ? byTenant.rows : (Array.isArray(byTenant) ? byTenant : []);
    renderBalancesByTenantTable(rows);

    setText("#outstandingMonthLabel", formatMonthLabel(month));
    renderOutstandingTable(rows);

    setText("#dunningMonthLabel", formatMonthLabel(month));
    renderDunningTable(rows);

    setLastUpdatedBalances();
  } catch (err) {
    console.error("[BALDBG] loadBalances error:", err);

    // Safe reset so UI doesn't show stale/blank weirdness
    renderBalancesOverview({
      month_start: month + "-01",
      total_due: 0,
      total_paid: 0,
      balance_total: 0,
      collection_rate_pct: 0
    });
    renderBalancesByTenantTable([]);
    renderOutstandingTable([]);
    renderDunningTable([]);

    setText("#outstandingMonthLabel", formatMonthLabel(month));
    setText("#dunningMonthLabel", formatMonthLabel(month));
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

/* -------- Leases loader (RESTORED) -------- */

function pickLeaseFields(r) {
  return {
    tenant:
      r.tenant ||
      r.full_name ||
      r.tenant_name ||
      r.tenant_full_name ||
      "-",
    unit:
      r.unit ||
      r.unit_code ||
      r.unit_name ||
      r.unit_label ||
      "-",
    rent:
      Number(r.rent_amount ?? r.rent ?? r.amount ?? 0),
    status:
      r.status || r.lease_status || "active",
    start:
      r.start_date || r.start || "",
    dueDay:
      r.due_day ?? r.dueDay ?? "",
    billingCycle:
      r.billing_cycle || r.billingCycle || "monthly",
  };
}

function getLeasesSearchQuery() {
  const el = $("#leaseSearch") || $("#leasesSearch") || $("#leasesQuery");
  return (el?.value || "").toLowerCase().trim();
}

function setLeasesCount(n) {
  const el = $("#leasesCount") || $("#kpiLeases"); // fallback
  if (el) el.textContent = String(n ?? 0);
}

function getLeasesTbody() {
  // Try the most likely IDs first
  return (
    $("#leasesTbody") ||
    $("#leasesBody") ||
    $("#leasesTableBody") ||
    document.querySelector("#leasesTable tbody") ||
    document.querySelector("#tblLeases tbody")
  );
}

function isEndedLeaseStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  return ["ended", "inactive", "terminated", "closed", "vacant", "expired"].some(k => s.includes(k));
}

// helper (keep near renderLeasesTable)
function isEndedLeaseStatus(status) {
  const s = String(status || "").toLowerCase().trim();
  return ["ended", "inactive", "terminated", "closed", "vacant", "expired"].some((k) =>
    s.includes(k)
  );
}

function renderLeasesTable(rows) {
  const tbody = getLeasesTbody();
  if (!tbody) {
    console.warn("Leases table body not found (IDs may differ). Leases loaded:", rows?.length || 0);
    return;
  }

  const out = (rows || []).map((r) => {
    const x = pickLeaseFields(r);
    const rentTxt = (typeof fmtKes === "function") ? fmtKes(x.rent) : String(x.rent);

    const statusTxt = String(x.status || "");
    const statusLower = statusTxt.toLowerCase();

    // Mark "ended"/inactive leases to mute the Cycle cell
    const isEnded =
      statusLower.includes("ended") ||
      statusLower.includes("end") ||
      statusLower.includes("inactive") ||
      statusLower.includes("terminated") ||
      statusLower.includes("closed");

    const esc = (v) => (typeof escapeHtml === "function" ? escapeHtml(String(v ?? "")) : String(v ?? ""));

    return `
      <tr>
        <td>${esc(x.tenant)}</td>
        <td>${esc(x.unit)}</td>
        <td>${esc(rentTxt)}</td>
        <td>${esc(statusTxt)}</td>
        <td>${esc(x.start || "")}</td>
        <td>${esc(x.dueDay || "")}</td>
        <td class="${isEnded ? "cycle-ended" : ""}">${esc(x.billingCycle || "")}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = out || `<tr><td colspan="7">No leases found</td></tr>`;
}

async function loadLeases() {
  try {
    const rows = await apiGet("/leases?limit=1000");
    const all = Array.isArray(rows?.data) ? rows.data : (Array.isArray(rows) ? rows : []);

    const q = getLeasesSearchQuery();
    const filtered = q
      ? all.filter((r) => {
          const x = pickLeaseFields(r);
          return (
            String(x.tenant).toLowerCase().includes(q) ||
            String(x.unit).toLowerCase().includes(q)
          );
        })
      : all;

    state.leasesView = filtered;

    setLeasesCount(filtered.length);
    renderLeasesTable(filtered);
  } catch (e) {
    console.error("loadLeases failed:", e);
    setLeasesCount(0);
    const tbody = getLeasesTbody();
    if (tbody) tbody.innerHTML = `<tr><td colspan="7">Error loading leases</td></tr>`;
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
  // Any clickable thing with data-tab="overview" etc
  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll('.panel[id^="tab-"]'));

  function activate(tabName, { pushState = true } = {}) {
    // Hide all panels
    panels.forEach((p) => p.classList.add("hidden"));

    // Show the chosen panel
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) panel.classList.remove("hidden");

    // Mark active button
    tabButtons.forEach((b) => {
      const isActive = (b.getAttribute("data-tab") === tabName);
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // Remember
    try { localStorage.setItem("rt_active_tab", tabName); } catch {}
    state.activeTab = tabName;

    // Optional: refresh data when entering certain tabs
    if (tabName === "overview" && typeof loadOverview === "function") loadOverview();
    if (tabName === "dunning" && typeof loadBalances === "function") loadBalances(); // dunning usually uses balances/outstanding
  }

  // ✅ expose helper (non-breaking)
  window.activateTab = activate;

  // Wire clicks
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tabName = btn.getAttribute("data-tab");
      if (tabName) activate(tabName);
    });
  });

  // Initial tab
  const saved = (() => {
    try { return localStorage.getItem("rt_active_tab"); } catch { return null; }
  })();

  const initial =
    (saved && document.getElementById(`tab-${saved}`)) ? saved :
    (document.getElementById("tab-overview") ? "overview" : (panels[0]?.id?.replace("tab-","") || "overview"));

  activate(initial, { pushState: false });
}

function initApiBaseControls() {
  const apiInput = $("#apiBase");     // top bar input
  const apiInput2 = $("#apiBase2");   // settings tab input
  const useBtn = $("#useApi");
  const saveSettings = $("#saveSettings");
  const resetSettings = $("#resetSettings");
  const adminInput = $("#adminToken");
  const docsBtn = $("#openDocs");

  // --- helpers ---
  const normalizeBase = (v) => String(v || "").trim().replace(/\/+$/, "");
  const readBase = () =>
    normalizeBase(state.apiBase) ||
    normalizeBase(localStorage.getItem("api_base")) ||
    normalizeBase(typeof API_BASE !== "undefined" ? API_BASE : "");

  const writeBase = (v) => {
    const base = normalizeBase(v);
    state.apiBase = base;
    if (base) localStorage.setItem("api_base", base);
    else localStorage.removeItem("api_base");
    if (apiInput) apiInput.value = base;
    if (apiInput2) apiInput2.value = base;
    return base;
  };

  // --- initial load: ALWAYS sync state + inputs from storage/default ---
  writeBase(readBase());

  // --- admin token initial ---
  const storedAdmin = getAdminTokenFromStorage();
  if (adminInput && storedAdmin) adminInput.value = storedAdmin;

  // --- Use this API (top bar) ---
  if (useBtn) {
    useBtn.addEventListener("click", () => {
      const v = normalizeBase(apiInput?.value);
      if (!v) return;

      writeBase(v);

      // Important: once base is set, do a reload of data so first requests
      // don't accidentally go to the site domain.
      try {
        setCurrentMonth(getSelectedMonth(), { triggerReload: true });
      } catch (_) {
        // fallback if setCurrentMonth isn't available
        if (typeof loadOverview === "function") loadOverview();
        if (typeof loadLeases === "function") loadLeases();
        if (typeof loadPayments === "function") loadPayments(true);
        if (typeof loadRentRoll === "function") loadRentRoll(true);
        if (typeof loadBalances === "function") loadBalances(true);
      }
    });
  }

  // --- Save settings (Settings tab) ---
  if (saveSettings) {
    saveSettings.addEventListener("click", () => {
      const base = normalizeBase(apiInput2?.value);
      const admin = normalizeBase(adminInput?.value);

      if (base) writeBase(base);

      if (admin) localStorage.setItem("admin_token", admin);
      else localStorage.removeItem("admin_token");

      alert("Settings saved (browser-local).");
    });
  }

  // --- Reset settings ---
  if (resetSettings) {
    resetSettings.addEventListener("click", () => {
      localStorage.removeItem("api_base");
      localStorage.removeItem("admin_token");

      // fall back to build-time default if present
      writeBase(typeof API_BASE !== "undefined" ? API_BASE : "");

      if (adminInput) adminInput.value = "";
      alert("Settings reset.");
    });
  }

  // --- Open docs ---
  if (docsBtn) {
    docsBtn.addEventListener("click", () => {
      const base = readBase();
      if (!base) {
        alert("Set API base first (click 'Use this API').");
        return;
      }
      window.open(base + "/docs", "_blank", "noopener");
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

  // Set dropdown defaults
  ["paymentsMonth", "rentrollMonth", "balancesMonth"].forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = defaultMonth;
  });

  // ✅ Also set Overview month input default
  const mp = document.getElementById("monthPicker");
  if (mp) mp.value = defaultMonth;

  // ✅ State is driven by the chosen month
  setCurrentMonth(defaultMonth, { triggerReload: false });

  // Existing wiring (dropdowns)
  wireMonthSelect(document.getElementById("paymentsMonth"));
  wireMonthSelect(document.getElementById("rentrollMonth"));
  wireMonthSelect(document.getElementById("balancesMonth"));

  // ✅ Wire Overview monthPicker (type="month") to reload everything
  if (mp && !mp.dataset.bound) {
    mp.dataset.bound = "1";
    mp.addEventListener("change", () => {
      const ym = mp.value || yyyymm();

      // Keep state in sync
      setCurrentMonth(ym, { triggerReload: false });

      // Keep dropdowns in sync so other tabs match Overview
      const b = document.getElementById("balancesMonth");
      if (b) b.value = ym;
      const p = document.getElementById("paymentsMonth");
      if (p) p.value = ym;
      const r = document.getElementById("rentrollMonth");
      if (r) r.value = ym;

      // Now reload all views for that month
      if (typeof reloadAllMonthViews === "function") reloadAllMonthViews();
      else {
        // Safe fallback if reloadAllMonthViews isn't present
        loadOverview?.();
        loadPayments?.(true);
        loadRentRoll?.(true);
        loadBalances?.();
        loadBalancesByUnit?.();
      }
    });
  }
}

/* ---------------- CSS helper + UI tweaks ---------------- */
function injectCssOnce(id, cssText) {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = cssText;
  document.head.appendChild(s);
}

/**
 * UI polish that does NOT depend on editing index.html
 * - reduce KPI number size (nice + responsive)
 * - Monthly summary grid (no overlap)
 * - hide duplicate “Monthly collection summary” label if it exists above the card
 * - Lease cycle text muted when lease is ended
 */
function ensureUiTweaks() {
  // inject CSS once
  injectCssOnce(
    "rt-ui-tweaks",
    `
    /* --- KPI numbers: tidy + consistent --- */
    #kpiLeases, #kpiOpen, #kpiPayments, #kpiBalance{
      font-size: clamp(24px, 2.0vw, 34px) !important;
      line-height: 1.12 !important;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    /* --- Monthly collection summary: clean grid (prevents overlap) --- */
    #collection-summary-month{
      margin-top: 12px !important;
      display: grid !important;
      gap: 12px !important;
      grid-template-columns: repeat(3, minmax(220px, 1fr)) !important;
      align-items: stretch !important;
    }
    @media (max-width: 980px){
      #collection-summary-month{
        grid-template-columns: repeat(2, minmax(200px, 1fr)) !important;
      }
    }
    @media (max-width: 620px){
      #collection-summary-month{
        grid-template-columns: 1fr !important;
      }
    }

    #collection-summary-month .sum-card{
      min-width: 0 !important;
      padding: 12px 14px !important;
      border-radius: 14px !important;
    }
    #collection-summary-month .sum-title{
      font-size: 13px;
      font-weight: 700;
      opacity: .92;
    }
    #collection-summary-month .sum-value{
      margin-top: 6px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    #collection-summary-month .sum-sub{
      margin-top: 6px;
      font-size: 13px;
      opacity: .8;
      font-weight: 600;
    }

    /* --- Leases: make Cycle text muted when lease is ended/inactive --- */
    .cycle-ended{
      color: var(--muted) !important;
      font-style: italic;
    }
  `
  );

  // Hide the duplicate “Monthly collection summary” line that sits ABOVE the card
  // (we keep the big header inside the card section, but remove the extra stray label)
  try {
    const wrap = document.querySelector("#collection-summary-month");
    if (wrap) {
      // Walk upward a bit and check previous siblings for the duplicate label
      let node = wrap;
      for (let i = 0; i < 4 && node; i++) {
        const prev = node.previousElementSibling;
        if (prev && /monthly collection summary/i.test((prev.textContent || "").trim())) {
          prev.style.display = "none";
          break;
        }
        node = node.parentElement;
      }
    }
  } catch (e) {
    console.warn("ensureUiTweaks hide-title failed:", e);
  }
}

/* -------- Loader resolver (prevents crashes when function names differ) -------- */
function callMaybe(fn, ...args) {
  return typeof fn === "function" ? fn(...args) : undefined;
}

function loadPaymentsSafe(...args) {
  if (typeof loadPayments === "function") return loadPayments(...args);
  if (typeof paymentsLoader === "function") return paymentsLoader(...args);
  if (typeof loadPayment === "function") return loadPayment(...args);
  console.warn("Payments loader not found (loadPayments/paymentsLoader/loadPayment) — skipping");
}

function loadRentRollSafe(...args) {
  if (typeof loadRentRoll === "function") return loadRentRoll(...args);
  if (typeof rentRollLoader === "function") return rentRollLoader(...args);
  console.warn("Rent roll loader not found (loadRentRoll/rentRollLoader) — skipping");
}

function loadBalancesSafe(...args) {
  if (typeof loadBalances === "function") return loadBalances(...args);
  if (typeof balancesLoader === "function") return balancesLoader(...args);
  console.warn("Balances loader not found (loadBalances/balancesLoader) — skipping");
}

function loadBalancesByUnitSafe(...args) {
  if (typeof loadBalancesByUnit === "function") return loadBalancesByUnit(...args);
  if (typeof balancesByUnitLoader === "function") return balancesByUnitLoader(...args);
  console.warn("BalancesByUnit loader not found (loadBalancesByUnit/balancesByUnitLoader) — skipping");
}

/**
 * Month picker (and other code) may call reloadAllMonthViews().
 * We MUST guarantee it never throws (otherwise other tabs go empty).
 */
window.reloadAllMonthViews = function reloadAllMonthViews() {
  const ym =
    (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
    (typeof state === "object" ? state.currentMonth : null) ||
    (typeof yyyymm === "function" ? yyyymm() : null);

  if (typeof setCurrentMonth === "function" && ym) {
    setCurrentMonth(ym, { triggerReload: false });
  }

  // Call what exists, safely
  callMaybe(loadOverview);
  callMaybe(loadLeases);
  loadPaymentsSafe(true);
  loadRentRollSafe(true);
  loadBalancesSafe();
  loadBalancesByUnitSafe();
};

/* -------- initial load -------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureUiTweaks();

  // Init (safe)
  initTabs?.();
  initApiBaseControls?.();
  initWhatsAppBuilder?.();
  initInvoiceActions?.();
  initExports?.();
  initRowWhatsAppButtons?.();

  try {
    await initMonthPicker?.();
  } catch (e) {
    console.error("initMonthPicker failed:", e);
    if (typeof setCurrentMonth === "function" && typeof yyyymm === "function") {
      setCurrentMonth(yyyymm(), { triggerReload: false });
    }
  }

  // ✅ Force state.currentMonth to match what the picker currently shows
  const ym =
    (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
    (typeof state === "object" ? state.currentMonth : null) ||
    (typeof yyyymm === "function" ? yyyymm() : null);

  if (typeof setCurrentMonth === "function" && ym) {
    setCurrentMonth(ym, { triggerReload: false });
  }

  // initial data load (safe, no crashes)
  callMaybe(loadOverview);
  callMaybe(loadLeases);
  loadPaymentsSafe(true);
  loadRentRollSafe(true);
  loadBalancesSafe();
  loadBalancesByUnitSafe();

  // Buttons / actions (safe)
  $("#reloadLeases")?.addEventListener("click", () => callMaybe(loadLeases));

  $("#reloadBalances")?.addEventListener("click", () => {
    loadBalancesSafe();
    loadBalancesByUnitSafe();
  });

  $("#reloadOutstandingByTenant")?.addEventListener("click", () => loadBalancesSafe());

  $("#applyPayments")?.addEventListener("click", () => loadPaymentsSafe());
  $("#clearPayments")?.addEventListener("click", () => {
    const t = $("#paymentsTenant"); if (t) t.value = "";
    const s = $("#paymentsStatus"); if (s) s.value = "";
    loadPaymentsSafe();
  });

  $("#applyRentroll")?.addEventListener("click", () => loadRentRollSafe());
  $("#clearRentroll")?.addEventListener("click", () => {
    const t = $("#rentrollTenant"); if (t) t.value = "";
    const p = $("#rentrollProperty"); if (p) p.value = "";
    loadRentRollSafe();
  });

  // Dunning -> WhatsApp quick fill
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-dun-tenant],button[data-dunTenant]");
    if (!btn) return;

    const tenant = btn.dataset.dunTenant || btn.getAttribute("data-dun-tenant") || "";
    const balance = Number(btn.dataset.dunBalance || btn.getAttribute("data-dun-balance") || 0);

    const ym =
      (typeof getSelectedMonth === "function" ? getSelectedMonth() : null) ||
      (typeof yyyymm === "function" ? yyyymm() : "");

    if ($("#waTenant")) $("#waTenant").value = tenant;
    if ($("#waPeriod")) $("#waPeriod").value = formatMonthLabel(ym);
    if ($("#waBalance")) $("#waBalance").value = String(balance);

    if (typeof window.activateTab === "function") window.activateTab("whatsapp");
  });

  $("#leaseSearch")?.addEventListener("input", () => callMaybe(loadLeases));
  $("#reloadDunning")?.addEventListener("click", () => loadBalancesSafe());
});
