/* ==================== Rent Tracker Dashboard — app.js (JS ONLY) ==================== */

/* small DOM helpers */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

/* -------- global state -------- */
const state = {
  apiBase: (typeof API_BASE !== "undefined" && API_BASE) ? String(API_BASE).trim() : "",
  currentMonth: null, // 'YYYY-MM' (single source of truth)
  activeTab: "overview",
  leasesView: [],
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

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.0%";
  return `${Number(n).toFixed(1)}%`;
}

function moneyToNumber(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  const isParenNeg = /^\(.*\)$/.test(s);
  const n = s.replace(/[^\d.-]/g, "");
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return isParenNeg ? -Math.abs(x) : x;
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

/* -------- token + headers -------- */
function getAdminTokenFromStorage() {
  return (localStorage.getItem("admin_token") || "").trim();
}

function authHeaders(extra = {}) {
  const h = { ...extra };
  const token = getAdminTokenFromStorage();
  if (token) h["X-Admin-Token"] = token; // ✅ backend-friendly
  return h;
}

/* -------- API helpers -------- */
async function apiGet(path, opts = {}) {
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is not set");

  const url = base + path;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders({ Accept: "application/json" }),
  });

  if (opts.allow404 && res.status === 404) return opts.fallback ?? [];
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText}${txt ? " | " + txt : ""}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

/* Try multiple endpoints (helps when backend path names differ) */
async function apiGetFirst(paths, opts = {}) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await apiGet(p, opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All endpoints failed");
}

async function apiPost(path, body, { admin = false } = {}) {
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is not set");

  const headers = { "Content-Type": "application/json" };
  if (admin) {
    const t = getAdminTokenFromStorage();
    if (t) headers["X-Admin-Token"] = t;
  }

  const res = await fetch(base + path, {
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

/* -------- month selection (single source of truth) -------- */
function getSelectedMonth() {
  return (
    $("#monthPicker")?.value ||
    $("#balancesMonth")?.value ||
    $("#paymentsMonth")?.value ||
    $("#rentrollMonth")?.value ||
    state.currentMonth ||
    yyyymm()
  );
}

function setCurrentMonth(ym, { triggerReload = true } = {}) {
  if (!ym) return;
  state.currentMonth = ym;

  const mp = $("#monthPicker");
  if (mp && mp.value !== ym) mp.value = ym;

  ["paymentsMonth", "rentrollMonth", "balancesMonth"].forEach((id) => {
    const el = $("#" + id);
    if (el && el.value !== ym) el.value = ym;
  });

  if (triggerReload) window.reloadAllMonthViews?.();
}

function wireMonthSelect(selectEl) {
  if (!selectEl) return;
  if (selectEl.dataset.wired === "1") return;
  selectEl.dataset.wired = "1";

  selectEl.addEventListener("change", () => {
    const ym = selectEl.value || state.currentMonth;
    setCurrentMonth(ym, { triggerReload: true });
  });
}

/* ---------------------------------------------------------------------------
   PAYMENTS TAB
--------------------------------------------------------------------------- */
function getPaymentsTbody() {
  return (
    document.querySelector("#paymentsTable tbody") ||
    document.querySelector("#paymentsBody") ||
    document.querySelector("#paymentsTbody") ||
    document.querySelector("table#payments tbody") ||
    document.querySelector("table[data-table='payments'] tbody") ||
    null
  );
}

function paymentsColspan(tbody, fallback = 5) {
  try {
    const table = tbody.closest("table");
    const thCount = table?.querySelectorAll("thead th")?.length;
    if (thCount) return thCount;
  } catch (_) {}
  return fallback;
}

function setPaymentsChips({ count = 0, total = 0 } = {}) {
  const countEl = $("#paymentsCount") || $("#paymentsCountChip") || document.querySelector("[data-payments-count]");
  const totalEl = $("#paymentsTotal") || $("#paymentsTotalChip") || document.querySelector("[data-payments-total]");
  if (countEl) countEl.textContent = String(count);
  if (totalEl) totalEl.textContent = fmtKes(total);
}

function showPaymentsRowMessage(tbody, msg) {
  const cs = paymentsColspan(tbody, 5);
  tbody.innerHTML = `<tr><td colspan="${cs}">${escapeHtml(String(msg))}</td></tr>`;
}

function normalizeRespToRows(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.data)) return resp.data;
  if (Array.isArray(resp.rows)) return resp.rows;
  return [];
}

function pickPaymentFields(r) {
  const dateRaw = r.paid_at || r.payment_date || r.date || r.created_at || "";
  let dateTxt = "—";
  try {
    const d = new Date(dateRaw);
    dateTxt = Number.isNaN(d.getTime()) ? String(dateRaw || "—") : d.toISOString().slice(0, 10);
  } catch (_) {
    dateTxt = String(dateRaw || "—");
  }

  const tenant = r.tenant || r.full_name || r.payer_name || r.tenant_name || "—";
  const method = r.method || r.pay_method || "—";
  const status = r.status || r.allocation_status || (r.invoice_id ? "allocated" : "unallocated");
  const amount = Number(r.amount ?? r.paid_amount ?? r.value ?? 0) || 0;

  return { dateTxt, tenant, method, status, amount };
}

async function loadPayments(initial = false) {
  const tbody = getPaymentsTbody();
  if (!tbody) return;

  const monthSel = $("#paymentsMonth");
  const tenantQ = ($("#paymentsTenant")?.value || "").trim().toLowerCase();
  const statusQ = ($("#paymentsStatus")?.value || "").trim().toLowerCase();

  const ym = (monthSel?.value || state.currentMonth || yyyymm());
  if (ym && ym !== state.currentMonth) setCurrentMonth(ym, { triggerReload: false });

  tbody.innerHTML = "";
  setPaymentsChips({ count: 0, total: 0 });
  showPaymentsRowMessage(tbody, "Loading payments…");

  try {
    const resp = await apiGetFirst([
      `/payments?month=${encodeURIComponent(ym)}`,
      `/dashboard/payments?month=${encodeURIComponent(ym)}`,
      `/form_payments?month=${encodeURIComponent(ym)}`,
    ], { allow404: true, fallback: [] });

    let rows = normalizeRespToRows(resp);

    if (tenantQ) {
      rows = rows.filter((r) => {
        const t = String(r.tenant || r.full_name || r.payer_name || r.tenant_name || "").toLowerCase();
        return t.includes(tenantQ);
      });
    }
    if (statusQ) {
      rows = rows.filter((r) =>
        String(r.status || r.allocation_status || "").toLowerCase().includes(statusQ)
      );
    }

    if (!rows.length) {
      tbody.innerHTML = "";
      setPaymentsChips({ count: 0, total: 0 });
      showPaymentsRowMessage(tbody, "No payments found for this month.");
      return;
    }

    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    let totalAmt = 0;

    for (const r of rows) {
      const x = pickPaymentFields(r);
      totalAmt += x.amount;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.dateTxt)}</td>
        <td>${escapeHtml(x.tenant)}</td>
        <td>${escapeHtml(x.method)}</td>
        <td>${escapeHtml(String(x.status || "—"))}</td>
        <td style="text-align:right">${fmtKes(x.amount)}</td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);
    setPaymentsChips({ count: rows.length, total: totalAmt });
  } catch (e) {
    console.error("Payments load failed:", e);
    tbody.innerHTML = "";
    setPaymentsChips({ count: 0, total: 0 });
    showPaymentsRowMessage(tbody, "Error loading payments. Check console/network.");
  }
}

/* ---------------------------------------------------------------------------
   BALANCES (overview + by_tenant + outstanding + dunning)
--------------------------------------------------------------------------- */
function renderBalancesOverview(o) {
  const data = (o && typeof o === "object" && "data" in o) ? o.data : o;

  const monthStart =
    data?.month_start ||
    data?.month ||
    getSelectedMonth() ||
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
    tr.innerHTML = `
      <td>${escapeHtml(unit ? `${tenant} (${unit})` : tenant)}</td>
      <td style="text-align:right">${fmtKes(bal)}</td>
      <td style="text-align:right">${fmtPct(pct)}</td>
      <td><button class="btn ghost" type="button" data-dunTenant="${escapeHtml(tenant)}" data-dunBalance="${bal}">WhatsApp</button></td>
    `;
    tbody.appendChild(tr);
  }
}

function setLastUpdatedBalances() {
  const now = new Date().toLocaleString("en-KE");
  setText("#balancesLastUpdated", `Last updated: ${now}`);
  setText("#outstandingLastUpdated", `Last updated: ${now}`);
  setText("#dunningLastUpdated", `Last updated: ${now}`);
}

async function loadBalances() {
  const month = getSelectedMonth();

  if (state.currentMonth !== month) {
    setCurrentMonth(month, { triggerReload: false });
  }

  try {
    const overview = await apiGetFirst([
      `/dashboard/balances/overview?month=${encodeURIComponent(month)}`,
      `/balances/overview?month=${encodeURIComponent(month)}`,
    ], { allow404: true, fallback: {} });

    renderBalancesOverview(overview);

    const byTenant = await apiGetFirst([
      `/dashboard/balances/by_tenant?month=${encodeURIComponent(month)}`,
      `/balances/by_tenant?month=${encodeURIComponent(month)}`,
    ], { allow404: true, fallback: [] });

    const rows =
      Array.isArray(byTenant?.rows) ? byTenant.rows :
      Array.isArray(byTenant?.data) ? byTenant.data :
      Array.isArray(byTenant) ? byTenant : [];

    renderBalancesByTenantTable(rows);

    setText("#outstandingMonthLabel", formatMonthLabel(month));
    renderOutstandingTable(rows);

    setText("#dunningMonthLabel", formatMonthLabel(month));
    renderDunningTable(rows);

    setLastUpdatedBalances();
  } catch (err) {
    console.error("loadBalances error:", err);
    renderBalancesOverview({ month_start: month + "-01", total_due: 0, total_paid: 0, balance_total: 0, collection_rate_pct: 0 });
    renderBalancesByTenantTable([]);
    renderOutstandingTable([]);
    renderDunningTable([]);
    setText("#outstandingMonthLabel", formatMonthLabel(month));
    setText("#dunningMonthLabel", formatMonthLabel(month));
    setLastUpdatedBalances();
  }
}

/* ---------------------------------------------------------------------------
   LEASES
--------------------------------------------------------------------------- */
function pickLeaseFields(r) {
  return {
    tenant: r.tenant || r.full_name || r.tenant_name || r.tenant_full_name || "-",
    unit: r.unit || r.unit_code || r.unit_name || r.unit_label || "-",
    rent: Number(r.rent_amount ?? r.rent ?? r.amount ?? 0),
    status: r.status || r.lease_status || "active",
    start: r.start_date || r.start || "",
    dueDay: r.due_day ?? r.dueDay ?? "",
    billingCycle: r.billing_cycle || r.billingCycle || "monthly",
  };
}

function getLeasesSearchQuery() {
  const el = $("#leaseSearch") || $("#leasesSearch") || $("#leasesQuery");
  return (el?.value || "").toLowerCase().trim();
}

function setLeasesCount(n) {
  const el = $("#leasesCount") || $("#kpiLeases");
  if (el) el.textContent = String(n ?? 0);
}

function getLeasesTbody() {
  return (
    $("#leasesTbody") ||
    $("#leasesBody") ||
    $("#leasesTableBody") ||
    document.querySelector("#leasesTable tbody") ||
    document.querySelector("#tblLeases tbody") ||
    null
  );
}

function renderLeasesTable(rows) {
  const tbody = getLeasesTbody();
  if (!tbody) return;

  const out = (rows || []).map((r) => {
    const x = pickLeaseFields(r);
    const statusLower = String(x.status || "").toLowerCase();
    const isEnded =
      statusLower.includes("ended") ||
      statusLower.includes("inactive") ||
      statusLower.includes("terminated") ||
      statusLower.includes("closed");

    return `
      <tr>
        <td>${escapeHtml(x.tenant)}</td>
        <td>${escapeHtml(x.unit)}</td>
        <td>${escapeHtml(fmtKes(x.rent))}</td>
        <td>${escapeHtml(String(x.status || ""))}</td>
        <td>${escapeHtml(x.start || "")}</td>
        <td>${escapeHtml(x.dueDay || "")}</td>
        <td class="${isEnded ? "cycle-ended" : ""}">${escapeHtml(x.billingCycle || "")}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = out || `<tr><td colspan="7">No leases found</td></tr>`;
}

async function loadLeases() {
  try {
    const rows = await apiGet("/leases?limit=1000", { allow404: true, fallback: [] });
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

/* ---------------------------------------------------------------------------
   RENT ROLL (kept as-is style, but JS-only)
--------------------------------------------------------------------------- */
async function loadRentRoll(initial = false) {
  const monthSelect = $("#rentrollMonth");
  const tenantFilter = ($("#rentrollTenant")?.value || "").trim().toLowerCase();
  const propertyFilter = ($("#rentrollProperty")?.value || "").trim().toLowerCase();
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");

  const countChip = $("#rentrollCount") || $("#rentrollCountChip");
  const dueChip = $("#rentrollDueChip");
  const paidChip = $("#rentrollPaidChip");
  const balChip = $("#rentrollBalChip");
  const creditChip = $("#rentrollCreditChip");

  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  if (countChip) countChip.textContent = "0";
  if (dueChip) dueChip.textContent = `${fmtKes(0)} due`;
  if (paidChip) paidChip.textContent = `${fmtKes(0)} paid`;
  if (balChip) balChip.textContent = `${fmtKes(0)} balance`;
  if (creditChip) creditChip.textContent = `${fmtKes(0)} credit`;

  try {
    const needMonths = !!monthSelect && monthSelect.options.length === 0;
    if ((initial || needMonths) && monthSelect) {
      const raw = await apiGet("/months", { allow404: true, fallback: [] });
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

    const resp = await apiGet(`/rent-roll?month=${encodeURIComponent(month)}`, { allow404: true, fallback: [] });
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

    const rowCredit = (r) => moneyToNumber(r.credits ?? r.credit ?? 0);

    const rowDue = (r) => {
      const td = moneyToNumber(r.total_due ?? 0);
      if (td) return td;
      const base = moneyToNumber(r.subtotal_rent ?? r.rent ?? r.rent_due ?? 0);
      const late = moneyToNumber(r.late_fees ?? 0);
      const cred = rowCredit(r);
      return base + late - cred;
    };

    const rowBal = (r) => moneyToNumber(r.balance ?? r.invoice_balance ?? r.month_delta ?? 0);

    const rowPaid = (r) => {
      const explicit = moneyToNumber(r.paid_total ?? r.paid ?? r.collected_amt ?? 0);
      if (explicit) return explicit;
      const due = rowDue(r);
      const bal = rowBal(r);
      return Math.max(0, due - bal);
    };

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

    const frag = document.createDocumentFragment();
    for (const r of filtered) {
      const period =
        r.period_start ? formatMonthLabel(String(r.period_start).slice(0, 7)) : (r.period || "—");

      const baseRent = moneyToNumber(r.subtotal_rent ?? r.rent ?? r.rent_due ?? 0);
      const lateFees = moneyToNumber(r.late_fees ?? 0);
      const status = String(r.status ?? r.invoice_status ?? "—").toLowerCase();
      const balance = rowBal(r);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.property_name || r.property || "—")}</td>
        <td>${escapeHtml(r.unit_code || r.unit || "—")}</td>
        <td>${escapeHtml(r.tenant || r.tenant_name || "—")}</td>
        <td>${escapeHtml(period)}</td>
        <td>${fmtKes(baseRent)}</td>
        <td>${lateFees ? fmtKes(lateFees) : "—"}</td>
        <td>
          <span class="status ${status === "paid" ? "ok" : "due"}">
            ${escapeHtml(status || "—")}
          </span>
        </td>
        <td style="text-align:right">${fmtKes(balance)}</td>
        <td>
          <button class="btn ghost btn-wa-rentroll" data-lease-id="${escapeHtml(r.lease_id || "")}" type="button">
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
    if (countChip) countChip.textContent = "0";
  }
}

/* ---------------------------------------------------------------------------
   EXPORT (Balances CSV)
--------------------------------------------------------------------------- */
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

async function exportBalancesCsv() {
  const ym = $("#balancesMonth")?.value || state.currentMonth || yyyymm();
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is not set. Click 'Use this API' first.");

  const paths = [
    `/balances/export?month=${encodeURIComponent(ym)}`,
    `/dashboard/balances/export?month=${encodeURIComponent(ym)}`,
  ];

  let lastErr = null;
  let res = null;

  for (const p of paths) {
    try {
      const url = base + p;
      const r = await fetch(url, { headers: authHeaders({}) }); // ✅ uses X-Admin-Token if set
      if (r.ok) { res = r; break; }
      const txt = await r.text().catch(() => "");
      lastErr = new Error(`GET ${p} -> ${r.status} ${txt}`.trim());
    } catch (e) {
      lastErr = e;
    }
  }

  if (!res) throw lastErr || new Error("Balances export failed.");

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Export returned JSON (not CSV). Response: ${txt}`.slice(0, 800));
  }

  const blob = await res.blob();
  const filename = `balances_${ym || "month"}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------------------------------------------------------------------------
   UI + NAV
--------------------------------------------------------------------------- */
function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll('.panel[id^="tab-"]'));

  function activate(tabName) {
    panels.forEach((p) => p.classList.add("hidden"));
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) panel.classList.remove("hidden");

    tabButtons.forEach((b) => {
      const isActive = (b.getAttribute("data-tab") === tabName);
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    try { localStorage.setItem("rt_active_tab", tabName); } catch {}
    state.activeTab = tabName;

    if (tabName === "overview") loadOverview?.();
    if (tabName === "dunning") loadBalances?.();
  }

  window.activateTab = activate;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tabName = btn.getAttribute("data-tab");
      if (tabName) activate(tabName);
    });
  });

  const saved = (() => {
    try { return localStorage.getItem("rt_active_tab"); } catch { return null; }
  })();

  const initial =
    (saved && document.getElementById(`tab-${saved}`)) ? saved :
    (document.getElementById("tab-overview") ? "overview" : (panels[0]?.id?.replace("tab-","") || "overview"));

  activate(initial);
}

function initApiBaseControls() {
  const apiInput = $("#apiBase");
  const apiInput2 = $("#apiBase2");
  const useBtn = $("#useApi");
  const saveSettings = $("#saveSettings");
  const resetSettings = $("#resetSettings");
  const adminInput = $("#adminToken");
  const docsBtn = $("#openDocs");

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

  writeBase(readBase());

  const storedAdmin = getAdminTokenFromStorage();
  if (adminInput && storedAdmin) adminInput.value = storedAdmin;

  if (useBtn) {
    useBtn.addEventListener("click", () => {
      const v = normalizeBase(apiInput?.value);
      if (!v) return;
      writeBase(v);
      setCurrentMonth(getSelectedMonth(), { triggerReload: true });
    });
  }

  if (saveSettings) {
    saveSettings.addEventListener("click", () => {
      const base = normalizeBase(apiInput2?.value);
      const admin = String(adminInput?.value || "").trim(); // ✅ do NOT normalize like a URL

      if (base) writeBase(base);

      if (admin) localStorage.setItem("admin_token", admin);
      else localStorage.removeItem("admin_token");

      alert("Settings saved (browser-local).");
    });
  }

  if (resetSettings) {
    resetSettings.addEventListener("click", () => {
      localStorage.removeItem("api_base");
      localStorage.removeItem("admin_token");
      writeBase(typeof API_BASE !== "undefined" ? API_BASE : "");
      if (adminInput) adminInput.value = "";
      alert("Settings reset.");
    });
  }

  if (docsBtn) {
    docsBtn.addEventListener("click", () => {
      const base = readBase();
      if (!base) { alert("Set API base first (click 'Use this API')."); return; }
      window.open(base + "/docs", "_blank", "noopener");
    });
  }
}

/* WhatsApp ad-hoc builder */
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

/* WhatsApp buttons in rent-roll + leases */
function initRowWhatsAppButtons() {
  document.addEventListener("click", (ev) => {
    const month = state.currentMonth || yyyymm();
    const base = (state.apiBase || "").replace(/\/+$/, "");

    const rrBtn = ev.target.closest(".btn-wa-rentroll");
    if (rrBtn) {
      const leaseId = rrBtn.dataset.leaseId;
      if (!leaseId) return;
      const url = base + `/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(leaseId)}&month=${encodeURIComponent(month)}`;
      window.open(url, "_blank", "noopener");
      return;
    }

    const leaseBtn = ev.target.closest(".btn-wa-lease");
    if (leaseBtn) {
      const leaseId = leaseBtn.dataset.leaseId;
      if (!leaseId) return;
      const url = base + `/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}&month=${encodeURIComponent(month)}`;
      window.open(url, "_blank", "noopener");
      return;
    }

    // Dunning -> WhatsApp quick fill
    const dunBtn = ev.target.closest("button[data-dun-tenant],button[data-dunTenant]");
    if (dunBtn) {
      const tenant = dunBtn.dataset.dunTenant || dunBtn.getAttribute("data-dun-tenant") || "";
      const balance = Number(dunBtn.dataset.dunBalance || dunBtn.getAttribute("data-dun-balance") || 0);
      const ym = getSelectedMonth();

      if ($("#waTenant")) $("#waTenant").value = tenant;
      if ($("#waPeriod")) $("#waPeriod").value = formatMonthLabel(ym);
      if ($("#waBalance")) $("#waBalance").value = String(balance);

      window.activateTab?.("whatsapp");
    }
  });
}

/* Invoice actions (top bar) */
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
        const base = (state.apiBase || "").replace(/\/+$/, "");
        const res = await fetch(base + "/admin/ping", { headers: authHeaders({}) });

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
      if (!id) { setMsg("Enter invoice_id (UUID) first."); return; }

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

/* Month picker init */
async function initMonthPicker() {
  const raw = await apiGet("/months", { allow404: true, fallback: [] });
  const months = Array.isArray(raw) ? raw : (raw?.data || []);
  const list = months.map(m => (typeof m === "string" ? m : m?.ym)).filter(Boolean);

  const defaultMonth = list[0] || yyyymm();

  const fillSelect = (id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = "";
    for (const ym of list.length ? list : [defaultMonth]) {
      const opt = document.createElement("option");
      opt.value = ym;
      opt.textContent = formatMonthLabel(ym);
      sel.appendChild(opt);
    }
    sel.value = defaultMonth;
    wireMonthSelect(sel);
  };

  fillSelect("paymentsMonth");
  fillSelect("rentrollMonth");
  fillSelect("balancesMonth");

  const mp = $("#monthPicker");
  if (mp) {
    mp.value = defaultMonth;
    if (!mp.dataset.bound) {
      mp.dataset.bound = "1";
      mp.addEventListener("change", () => {
        const ym = mp.value || yyyymm();
        setCurrentMonth(ym, { triggerReload: true });
      });
    }
  }

  setCurrentMonth(defaultMonth, { triggerReload: false });
}

/* CSS tweaks (safe) */
function injectCssOnce(id, cssText) {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = cssText;
  document.head.appendChild(s);
}

function ensureUiTweaks() {
  injectCssOnce("rt-ui-tweaks", `
    #kpiLeases, #kpiOpen, #kpiPayments, #kpiBalance{
      font-size: clamp(24px, 2.0vw, 34px) !important;
      line-height: 1.12 !important;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .cycle-ended{ color: var(--muted) !important; font-style: italic; }
  `);
}

/* ---------------------------------------------------------------------------
   OVERVIEW (kept minimal here; uses balances overview as source)
--------------------------------------------------------------------------- */
async function loadOverview() {
  const kpiLeases   = $("#kpiLeases");
  const kpiOpen     = $("#kpiOpen");
  const kpiPayments = $("#kpiPayments");
  const kpiBalance  = $("#kpiBalance");
  const summaryWrap = $("#collection-summary-month");

  const ym = getSelectedMonth();
  if (state.currentMonth !== ym) setCurrentMonth(ym, { triggerReload: false });

  const fmtDrCr = (n) => {
    const x = Number(n) || 0;
    if (x < 0) return `${fmtKes(Math.abs(x))} CR`;
    if (x > 0) return `${fmtKes(x)} DR`;
    return `${fmtKes(0)}`;
  };

  const safeGet = async (fn, fallback) => {
    try { return await fn(); } catch { return fallback; }
  };

  try {
    const balOv = await apiGetFirst([
      `/dashboard/balances/overview?month=${encodeURIComponent(ym)}`,
      `/balances/overview?month=${encodeURIComponent(ym)}`,
    ], { allow404: true, fallback: {} });

    const data = (balOv && typeof balOv === "object" && "data" in balOv) ? balOv.data : balOv;

    const leasesResp = await safeGet(() => apiGet("/leases?limit=1000", { allow404: true, fallback: [] }), []);
    const leases = Array.isArray(leasesResp?.data) ? leasesResp.data : (Array.isArray(leasesResp) ? leasesResp : []);

    const rrResp = await safeGet(() => apiGet(`/rent-roll?month=${encodeURIComponent(ym)}`, { allow404: true, fallback: [] }), []);
    const rentRoll = rrResp?.data || rrResp || [];

    if (kpiLeases) kpiLeases.textContent = leases.length;

    const openCount = Array.isArray(rentRoll)
      ? rentRoll.filter((r) => (r.status || "").toLowerCase() !== "paid").length
      : 0;
    if (kpiOpen) kpiOpen.textContent = openCount;

    const openingCR = Number(data?.opening_credit_total ?? 0);
    const openingDR = Number(data?.opening_debit_total ?? 0);

    const invoiced  = Number(data?.total_due ?? 0);
    const collected = Number(data?.cash_collected_total ?? data?.total_paid ?? 0);
    const closing   = Number(data?.closing_balance_total ?? data?.balance_total ?? 0);

    const movement = invoiced - collected;

    const rawRate = invoiced > 0 ? (collected / invoiced) * 100 : 0;
    const collectionRate = Math.min(100, rawRate);
    const overPct = Math.max(0, rawRate - 100);

    const rateText = overPct > 0
      ? `${fmtPct(collectionRate)} collected • ${fmtPct(overPct)} over-collected`
      : `${fmtPct(collectionRate)} collection rate`;

    if (kpiPayments) kpiPayments.textContent = fmtKes(collected);
    if (kpiBalance)  kpiBalance.textContent  = fmtDrCr(closing);

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
  } catch (err) {
    console.error("loadOverview error:", err);
    if (kpiLeases)   kpiLeases.textContent   = "—";
    if (kpiOpen)     kpiOpen.textContent     = "—";
    if (kpiPayments) kpiPayments.textContent = "—";
    if (kpiBalance)  kpiBalance.textContent  = "—";
    if (summaryWrap) summaryWrap.innerHTML = `<div class="sum-card"><strong>Error loading</strong></div>`;
  }
}

/* ---------------------------------------------------------------------------
   SAFE global reload (never throws)
--------------------------------------------------------------------------- */
window.reloadAllMonthViews = function reloadAllMonthViews() {
  try { loadOverview?.(); } catch (e) { console.warn("loadOverview fail", e); }
  try { loadLeases?.(); } catch (e) { console.warn("loadLeases fail", e); }
  try { loadPayments?.(true); } catch (e) { console.warn("loadPayments fail", e); }
  try { loadRentRoll?.(true); } catch (e) { console.warn("loadRentRoll fail", e); }
  try { loadBalances?.(); } catch (e) { console.warn("loadBalances fail", e); }
};

/* ---------------------------------------------------------------------------
   initial load
--------------------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  ensureUiTweaks();

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
    setCurrentMonth(yyyymm(), { triggerReload: false });
  }

  setCurrentMonth(getSelectedMonth(), { triggerReload: false });
  window.reloadAllMonthViews();

  $("#reloadLeases")?.addEventListener("click", () => loadLeases?.());
  $("#reloadBalances")?.addEventListener("click", () => loadBalances?.());

  $("#applyPayments")?.addEventListener("click", () => loadPayments?.());
  $("#clearPayments")?.addEventListener("click", () => {
    const t = $("#paymentsTenant"); if (t) t.value = "";
    const s = $("#paymentsStatus"); if (s) s.value = "";
    loadPayments?.();
  });

  $("#applyRentroll")?.addEventListener("click", () => loadRentRoll?.());
  $("#clearRentroll")?.addEventListener("click", () => {
    const t = $("#rentrollTenant"); if (t) t.value = "";
    const p = $("#rentrollProperty"); if (p) p.value = "";
    loadRentRoll?.();
  });

  $("#leaseSearch")?.addEventListener("input", () => loadLeases?.());
});
