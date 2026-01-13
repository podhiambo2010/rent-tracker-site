/* Rent Tracker Dashboard — app.js
 * Updated: 2026-01-09
 * Notes:
 * - Matches current index.html IDs (leasesTenant + leasesStatus, rentroll has Paid + Credit columns)
 * - Uses rentroll JSON fields: property_name, unit_code, subtotal_rent, late_fees, credits, total_due, paid_total, invoice_balance, lease_running_balance
 * - Dunning has no month picker; it uses Balances month (if present) else global monthPicker
 */

"use strict";

/* ------------------------- DOM helpers ------------------------- */
const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

// Date helpers (for Dunning)
function parseDateOnly(s) {
  if (!s) return null;
  // Expect YYYY-MM-DD; force local midnight
  const d = new Date(String(s).slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysOverdueFromDueDate(dueDateStr) {
  const due = parseDateOnly(dueDateStr);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - due) / 86400000);
  return diff > 0 ? diff : 0;
}

// Numeric helpers
function clamp0(n, cap = 1e15) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  return Math.min(x, cap);
}

// Convert unknown values to a safe number (handles strings like "1,234"; null -> default).
function toNumber(v, def = 0) {
  if (v === null || v === undefined) return def;
  if (typeof v === "number") return Number.isFinite(v) ? v : def;
  const s = String(v).trim();
  if (!s) return def;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : def;
}


function fmtPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0%";
  return `${x.toFixed(1)}%`;
}

function setText(sel, text) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.textContent = text;
}

function show(elOrSel) {
  const el = typeof elOrSel === "string" ? $(elOrSel) : elOrSel;
  if (el) el.classList.remove("hidden");
}

function hide(elOrSel) {
  const el = typeof elOrSel === "string" ? $(elOrSel) : elOrSel;
  if (el) el.classList.add("hidden");
}

function sum(rows, pick) {
  return (rows || []).reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
}

function monthLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function normalizePhoneKE(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0")) s = "254" + s.slice(1);
  return s;
}

// Back-compat alias (some code paths call this older name)
function normalizeKenyanPhone(p) {
  return normalizePhoneKE(p);
}


/* ------------------------- Response shape helpers ------------------------- */
function unwrapRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const maybe = data.rows ?? data.data ?? data.items ?? data.results ?? data.records;
  if (Array.isArray(maybe)) return maybe;
  return [];
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickStr(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function currentMonthFor(sel) {
  return $(sel)?.value || state.month;
}

/* ------------------------- State ------------------------- */
const state = {
  apiBase: "",
  month: "",
  leases: [],
  payments: [],
  rentroll: [],
  balances: [],
};

/* ------------------------- API ------------------------- */
function apiBase() {
  const b = (state.apiBase || "").trim().replace(/\/+$/, "");
  return b;
}

function getAdminTokenFromStorage() {
  return localStorage.getItem("admin_token") || "";
}

async function apiFetch(path, opts = {}) {
  const base = apiBase();
  if (!base) throw new Error("API base is empty");

  const {
    method = "GET",
    payload = null,
    admin = false,
    headers: extraHeaders = {},
    timeoutMs = 25000,
  } = opts;

  const url = base + path;

  const headers = {
    Accept: "application/json",
    ...extraHeaders,
  };

  if (payload != null && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  if (admin) {
    const t = getAdminTokenFromStorage() || window.getAdminToken?.() || "";
    if (t) headers["X-Admin-Token"] = t;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  let raw = "";
  try {
    res = await fetch(url, {
      method,
      headers,
      body: payload != null && method !== "GET" ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    raw = await res.text().catch(() => "");

    let parsed = raw;
    if (ct.includes("application/json")) {
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (_) {}
    }

    if (!res.ok) {
      const msg =
        typeof parsed === "object" && parsed
          ? (parsed.error || parsed.detail || JSON.stringify(parsed)).slice(0, 400)
          : String(raw || "").slice(0, 400);

      throw new Error(`${method} ${path} -> HTTP ${res.status}${msg ? ` • ${msg}` : ""}`);
    }

    return parsed;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`${method} ${path} -> timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path, { admin = false, timeoutMs } = {}) {
  return await apiFetch(path, { method: "GET", admin, timeoutMs });
}

async function apiPost(path, payload, { admin = false, timeoutMs } = {}) {
  return await apiFetch(path, { method: "POST", payload, admin, timeoutMs });
}

/* ------------------------- Tabs ------------------------- */
function initTabs() {
  const tabs = Array.from(document.querySelectorAll("nav .tab"));
  const panels = Array.from(document.querySelectorAll('section > .panel[id^="tab-"]'));

  function activate(name) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    panels.forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${name}`));
    localStorage.setItem("active_tab", name);

    if (name === "leases") loadLeases(true);
    if (name === "payments") loadPayments(true);
    if (name === "rentroll") loadRentRoll(true);
    if (name === "balances") loadBalances(true);
    if (name === "dunning") loadDunning(true);
  }

  tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.tab)));

  const saved = localStorage.getItem("active_tab") || "overview";
  activate(saved);
}

/* ------------------------- API base controls ------------------------- */
function initApiBaseControls() {
  const in1 = $("#apiBase");
  const in2 = $("#apiBase2");
  const useBtn = $("#useApi");
  const docsBtn = $("#openDocs");

  const saved = localStorage.getItem("api_base") || "";
  state.apiBase = saved;

  if (in1) in1.value = saved;
  if (in2) in2.value = saved;

  const apply = () => {
    const v = (in1?.value || in2?.value || "").trim();
    if (!v) return;
    state.apiBase = v;
    localStorage.setItem("api_base", v);
    if (in1) in1.value = v;
    if (in2) in2.value = v;

    loadOverview();
    loadLeases(true);
    loadPayments(true);
    loadRentRoll(true);
    loadBalances(true);
    loadDunning(true);
  };

  if (useBtn) useBtn.addEventListener("click", apply);

  if (docsBtn) {
    docsBtn.addEventListener("click", () => {
      const base = apiBase();
      if (!base) return alert("Set API base first.");
      window.open(base + "/docs", "_blank", "noopener,noreferrer");
    });
  }
}

/* ------------------------- Month controls ------------------------- */
function initMonthPicker() {
  const mp = $("#monthPicker");
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const saved = localStorage.getItem("month") || current;
  state.month = saved;

  if (mp) {
    mp.type = "month";
    mp.value = saved;
  }

  const months = buildRecentMonths(24);
  fillSelect("#paymentsMonth", months, saved);
  fillSelect("#rentrollMonth", months, saved);
  fillSelect("#balancesMonth", months, saved);
  fillSelect("#dunningMonth", months, saved);

  if (mp) {
    mp.addEventListener("change", () => {
      state.month = mp.value || current;
      localStorage.setItem("month", state.month);

      setSelectValue("#paymentsMonth", state.month);
      setSelectValue("#rentrollMonth", state.month);
      setSelectValue("#balancesMonth", state.month);
      setSelectValue("#dunningMonth", state.month);

      loadOverview();
      loadPayments(true);
      loadRentRoll(true);
      loadBalances(true);
      loadDunning(true);
    });
  }
}

function buildRecentMonths(n = 18) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function fillSelect(sel, values, selected) {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = values.map((v) => `<option value="${v}">${monthLabel(v)}</option>`).join("");
  el.value = selected || values[0] || "";
}

function setSelectValue(sel, value) {
  const el = $(sel);
  if (el) el.value = value || "";
}

function waDirect(phone, message) {
  return buildWhatsAppLink(phone, message);
}

/* ------------------------- Overview ------------------------- */
async function loadOverview() {
  try {
    const m = state.month;
    const d = await apiGet(`/dashboard/overview?month=${encodeURIComponent(m)}`);

    const num = (v, def = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    };
    const hasEl = (sel) => !!$(sel);
    const put = (sel, text) => { if (hasEl(sel)) setText(sel, text); };

    const leasesCount = d.active_leases ?? null;
    const openInvoicesCnt = d.open_invoices_month ?? null;

    const billedMonth = num(d.total_due_month, 0);
    const rentReceived = num(d.rent_received_month, 0);
    const cashReceived = num(d.cash_received_month, 0);
    const overdueMonth = num(d.overdue_month_total, 0);

    const openingNet = d.opening_balance_bf ?? null;
    const closingNet = d.closing_balance_cf ?? null;

    const arrearsPaid = num(d.arrears_paid_month, 0);

    const creditsTotalCF = num(d.credit_total, 0);
    const top = d.top_credit || {};
    const rentRate = num(d.rent_collection_rate_pct, 0);

    put("#kpiLeases", leasesCount != null ? String(leasesCount) : "—");
    put("#kpiOpen", openInvoicesCnt != null ? String(openInvoicesCnt) : "—");
    put("#kpiPayments", fmtKes(rentReceived));
    put("#kpiBalance", fmtKes(overdueMonth));

    put("#summaryMonthLabel", monthLabel(m));
    put("#summaryMonthDue", `Rent billed (month) ${fmtKes(billedMonth)}`);
    put("#summaryMonthCollected", `Rent received (month) ${fmtKes(rentReceived)}`);
    put("#summaryCashReceived", `Cash received (month) ${fmtKes(cashReceived)}`);

    if (openingNet != null && closingNet != null) {
      put("#summaryMonthBalance", `Balance at start (BF) ${fmtKes(openingNet)} • Balance at end (CF) ${fmtKes(closingNet)}`);
    } else if (closingNet != null) {
      put("#summaryMonthBalance", `Balance at end (CF) ${fmtKes(closingNet)}`);
    } else {
      put("#summaryMonthBalance", `Balance at end (CF) ${fmtKes(overdueMonth)}`);
    }

    put("#summaryMonthRate", `${fmtPct(rentRate)} Rent collection rate`);
    put("#summaryArrearsCleared", `Arrears paid (month) ${fmtKes(arrearsPaid)}`);

    if (hasEl("#summaryOverpayments")) {
      if (creditsTotalCF > 0.0001) {
        const who = top.unit && top.unit !== "-" ? top.unit : top.tenant || "—";
        const amt = num(top.amount, 0);
        put("#summaryOverpayments", `Tenant credit (prepaid) ${fmtKes(creditsTotalCF)} • Largest credit: ${who} ${fmtKes(amt)}`);
      } else {
        put("#summaryOverpayments", `Tenant credit (prepaid) ${fmtKes(0)}`);
      }
    }
  } catch (e) {
    console.warn("loadOverview failed:", e);
  }
}

/* ------------------------- Leases ------------------------- */
function initLeases() {
  $("#applyLeases")?.addEventListener("click", () => loadLeases(true));
  $("#reloadLeases")?.addEventListener("click", () => loadLeases(true));

  $("#clearLeases")?.addEventListener("click", () => {
    const q = $("#leasesTenant"); if (q) q.value = "";
    const s = $("#leasesStatus"); if (s) s.value = "";
    loadLeases(true);
  });

  $("#leasesStatus")?.addEventListener("change", () => loadLeases(true));
}

async function loadLeases(force = false) {
  try {
    const m = state.month;
    let data;
    try { data = await apiGet(`/leases?month=${encodeURIComponent(m)}`); }
    catch (_) { data = await apiGet(`/dashboard/leases?month=${encodeURIComponent(m)}`); }

    state.leases = unwrapRows(data);
    renderLeases();
  } catch (e) {
    console.warn("loadLeases failed:", e);
    state.leases = [];
    renderLeases();
  }
}

function renderLeases() {
  const body = $("#leasesBody");
  const empty = $("#leasesEmpty");
  if (!body) return;

  const q = String($("#leasesTenant")?.value || "").trim().toLowerCase();
  const statusF = String($("#leasesStatus")?.value || "").trim().toLowerCase();

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const rows = (state.leases || []).filter((r) => {
    const tenant = (r.tenant || r.full_name || r.tenant_name || "").toLowerCase();
    const unit = (r.unit || r.unit_code || r.unit || "").toLowerCase();
    const combined = `${tenant} ${unit}`.trim();

    const endRaw = r.end_date || r.lease_end || r.end || r.move_out || null;
    const isEnded =
      (r.status && String(r.status).toLowerCase().includes("end")) ||
      (r.is_active === false) ||
      (r.active === false) ||
      (endRaw ? new Date(String(endRaw).slice(0, 10)) < today : false);

    const st = isEnded ? "ended" : "active";

    const okQ = !q || combined.includes(q);
    const okStatus = !statusF || st.includes(statusF);
    return okQ && okStatus;
  });

  setText("#leasesCount", rows.length);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows.map((r) => {
    const tenant = pickStr(r.tenant, r.full_name, r.tenant_name) || "—";
    const unit = pickStr(r.unit_code, r.unit, r.unit_name) || "—";
    const rent = pickNum(r.monthly_rent, r.rent, r.rent_amount, r.amount, 0);

    const cycle = pickStr(r.cycle, r.billing_cycle, r.payment_cycle, r.rent_cycle) || "—";
    const dueDay = pickStr(r.due_day, r.dueDay, r.due_day_of_month) || (r.due_date ? String(r.due_date).slice(8, 10) : "—");

    const endRaw = r.end_date || r.lease_end || r.end || r.move_out || null;
    const ended =
      (r.status && String(r.status).toLowerCase().includes("end")) ||
      (r.is_active === false) ||
      (r.active === false) ||
      (endRaw ? new Date(String(endRaw).slice(0, 10)) < today : false);

    const status = ended ? "ended" : "active";
    const statusClass = ended ? "ended" : "ok";

    const phone = normalizePhoneKE(r.phone || r.msisdn || r.whatsapp_phone || "");
    const waText = `Hello ${tenant},\nKindly note your rent arrangements for ${unit}. Thank you.`;
    const waHref = phone ? buildWhatsAppLink(phone, waText) : "";

    return `
      <tr>
        <td>${escapeHtml(tenant)}</td>
        <td>${escapeHtml(unit)}</td>
        <td class="num">${fmtKes(rent)}</td>
        <td>${escapeHtml(cycle)}</td>
        <td>${escapeHtml(String(dueDay))}</td>
        <td><span class="status ${statusClass}">${escapeHtml(status)}</span></td>
        <td>${waHref ? `<a href="${waHref}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted">—</span>`}</td>
      </tr>`;
  }).join("");
}

/* ------------------------- Payments ------------------------- */
function initPayments() {
  $("#applyPayments")?.addEventListener("click", () => loadPayments(true));
  $("#clearPayments")?.addEventListener("click", () => {
    setSelectValue("#paymentsMonth", state.month);
    const t = $("#paymentsTenant"); if (t) t.value = "";
    const s = $("#paymentsStatus"); if (s) s.value = "";
    loadPayments(true);
  });
}

async function loadPayments(force = false) {
  try {
    const m = currentMonthFor("#paymentsMonth");
    let data;
    try { data = await apiGet(`/payments?month=${encodeURIComponent(m)}`); }
    catch (_) { data = await apiGet(`/dashboard/payments?month=${encodeURIComponent(m)}`); }

    state.payments = unwrapRows(data);
    renderPayments();
  } catch (e) {
    console.warn("loadPayments failed:", e);
    state.payments = [];
    renderPayments();
  }
}

function renderPayments() {
  const body = $("#paymentsBody");
  const empty = $("#paymentsEmpty");
  if (!body) return;

  const q = String($("#paymentsTenant")?.value || "").trim().toLowerCase();
  const statusF = String($("#paymentsStatus")?.value || "").trim().toLowerCase();

  const rows = (state.payments || []).filter((r) => {
    const tenant = (r.tenant || r.full_name || r.tenant_name || "").toLowerCase();
    const payer = (r.payer_name || r.payer || r.name || "").toLowerCase();
    const unit = (r.unit || r.unit_code || "").toLowerCase();
    const combined = `${tenant} ${payer} ${unit}`.trim();

    const st = String(r.status || r.alloc_status || (r.invoice_id ? "allocated" : "unallocated") || "").toLowerCase();
    const okStatus = !statusF || st.includes(statusF);
    const okQ = !q || combined.includes(q);
    return okStatus && okQ;
  });

  setText("#paymentsCount", rows.length);
  setText("#paymentsCountChip", rows.length);
  setText("#paymentsTotalChip", fmtKes(sum(rows, (r) => pickNum(r.amount, r.paid_amount, r.paid, 0))));

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows.map((r) => {
    const date = r.paid_at || r.date || r.created_at || "—";
    const tenant =
      r.tenant ||
      r.full_name ||
      r.tenant_name ||
      r.payer_name ||
      r.payer ||
      (r.unit_code ? `Unit ${r.unit_code}` : "—");

    const method = r.method || r.channel || "—";
    const st = r.status || r.alloc_status || (r.invoice_id ? "allocated" : "unallocated");
    const amt = pickNum(r.amount, r.paid_amount, r.paid, 0);

    return `
      <tr>
        <td>${escapeHtml(String(date).slice(0, 10))}</td>
        <td>${escapeHtml(tenant)}</td>
        <td>${escapeHtml(method)}</td>
        <td class="muted">${escapeHtml(st)}</td>
        <td class="num">${fmtKes(amt)}</td>
      </tr>`;
  }).join("");
}

/* ------------------------- Rent Roll ------------------------- */
function initRentRoll() {
  $("#applyRentroll")?.addEventListener("click", () => loadRentRoll(true));
  $("#clearRentroll")?.addEventListener("click", () => {
    setSelectValue("#rentrollMonth", state.month);
    const t = $("#rentrollTenant"); if (t) t.value = "";
    const p = $("#rentrollProperty"); if (p) p.value = "";
    loadRentRoll(true);
  });
}

async function loadRentRoll(force = false) {
  try {
    const m = currentMonthFor("#rentrollMonth") || state.month;

    let data;
    try {
      data = await apiGet(`/rentroll?month=${encodeURIComponent(m)}`);
    } catch (_) {
      data = await apiGet(`/dashboard/rentroll?month=${encodeURIComponent(m)}`);
    }

    state.rentroll = unwrapRows(data);
    renderRentRoll();

  } catch (e) {
    console.warn("loadRentRoll failed:", e);
    state.rentroll = [];
    renderRentRoll();
  }
}

function renderRentRoll() {
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");
  if (!body) return;

  const m = currentMonthFor("#rentrollMonth") || state.month;

  const qT = String($("#rentrollTenant")?.value || "").trim().toLowerCase();
  const qP = String($("#rentrollProperty")?.value || "").trim().toLowerCase();

  const rows = (state.rentroll || []).filter((r) => {
    const tenantLike = (r.tenant || r.tenant_name || r.full_name || r.unit_code || "").toLowerCase();
    const prop = (r.property_name || r.property || "").toLowerCase();
    return (!qT || tenantLike.includes(qT)) && (!qP || prop.includes(qP));
  });

  setText("#rentrollCount", rows.length);

  const billedTotal = sum(rows, (r) => pickNum(r.total_due, r.subtotal_rent, 0));
  const paidTotal = sum(rows, (r) => pickNum(r.paid_total, 0));
  const overdueTotal = sum(rows, (r) => Math.max(0, pickNum(r.invoice_balance, 0)));
  const creditTotal =
    sum(rows, (r) => Math.max(0, -pickNum(r.invoice_balance, 0))) +
    sum(rows, (r) => Math.max(0, pickNum(r.credits, 0)));

  setText("#rentrollDueChip", `${fmtKes(billedTotal)} billed`);
  setText("#rentrollPaidChip", `${fmtKes(paidTotal)} received`);
  setText("#rentrollBalChip", `${fmtKes(overdueTotal)} overdue`);
  setText("#rentrollCreditChip", `${fmtKes(creditTotal)} prepaid credit`);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows.map((r) => {
    const property = pickStr(r.property_name, r.property) || "—";
    const unit = pickStr(r.unit_code, r.unit) || "—";
    const tenant = pickStr(r.tenant, r.tenant_name, r.full_name) || unit;

    const period =
      (r.period_start && r.period_end)
        ? `${String(r.period_start).slice(0, 10)} → ${String(r.period_end).slice(0, 10)}`
        : m;

    const rentBilled = pickNum(r.total_due, r.subtotal_rent, 0);
    const late = pickNum(r.late_fees, 0);
    const paid = pickNum(r.paid_total, 0);
    const invBal = pickNum(r.invoice_balance, 0);
    const credit = Math.max(0, -invBal) + Math.max(0, pickNum(r.credits, 0));
    const balEnd = invBal;

    const statusText = balEnd > 0 ? "due" : "ok";
    const statusClass = balEnd > 0 ? "due" : "ok";

    const invoiceId = pickStr(r.invoice_id) || "";
    const leaseId = pickStr(r.lease_id) || "";

    const waUrl =
      (invoiceId ? `${apiBase()}/wa_for_rentroll_redirect?invoice_id=${encodeURIComponent(invoiceId)}` : "") ||
      (leaseId ? `${apiBase()}/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(leaseId)}&month=${encodeURIComponent(m)}` : "");

    return `
      <tr>
        <td>${escapeHtml(property)}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${escapeHtml(tenant)}</td>
        <td>${escapeHtml(String(period))}</td>
        <td class="num">${fmtKes(rentBilled)}</td>
        <td class="num">${fmtKes(late)}</td>
        <td class="num">${fmtKes(paid)}</td>
        <td class="num">${fmtKes(credit)}</td>
        <td class="num">${fmtKes(balEnd)}</td>
        <td><span class="status ${statusClass}">${escapeHtml(statusText)}</span></td>
        <td>
          ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted">—</span>`}
        </td>
      </tr>`;
  }).join("");
}

/* ------------------------- Balances + Outstanding ------------------------- */
function initBalances() {
  $("#reloadBalances")?.addEventListener("click", () => loadBalances(true));
  $("#balancesMonth")?.addEventListener("change", () => loadBalances(true));

  $("#reloadOutstandingByTenant")?.addEventListener("click", () => {
    renderOutstandingFromBalances();
  });

  $("#btnExportBalances")?.addEventListener("click", async () => {
    try {
      const m = currentMonthFor("#balancesMonth") || state.month;
      const base = apiBase();
      if (!base) return alert("Set API base first.");

      const url = `${base}/balances/export?month=${encodeURIComponent(m)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    }
  });
}

async function loadBalances(force = false) {
  try {
    const m = currentMonthFor("#balancesMonth") || state.month;

    const data = await apiGet(`/balances/by_unit?month=${encodeURIComponent(m)}`);
    state.balances = unwrapRows(data);

    renderBalances();
    renderOutstandingFromBalances();

    setText("#balMonthLabel", monthLabel(m));
    setText("#outstandingMonthLabel", monthLabel(m));
    setText("#balancesLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);
    setText("#outstandingLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);

    loadOverview();
  } catch (e) {
    console.warn("loadBalances failed:", e);
    state.balances = [];
    renderBalances();
    renderOutstandingFromBalances();
    loadOverview();
  }
}

function renderBalances() {
  const body = $("#balancesBody");
  const empty = $("#balancesEmpty");
  if (!body) return;

  const rows = state.balances || [];
  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    setText("#balMonthDue", "KES 0 billed");
    setText("#balMonthCollected", "KES 0 received");
    setText("#balMonthBalance", "KES 0 arrears (end)");
    setText("#balMonthRate", "0.0% rent collection rate");
    return;
  }
  hide(empty);

  const dueTotal = sum(rows, (r) => pickNum(r.total_due, r.rent_due, r.invoiced_amt, r.subtotal_rent, 0));
  const paidTotal = sum(rows, (r) => pickNum(r.paid_total, r.paid, r.collected_amt, 0));
  const balTotal = sum(rows, (r) => pickNum(r.balance, r.closing_balance, r.invoice_balance, r.lease_running_balance, 0));
  const rate = dueTotal ? (paidTotal / dueTotal) * 100 : 0;

  setText("#balMonthDue", `${fmtKes(dueTotal)} billed`);
  setText("#balMonthCollected", `${fmtKes(paidTotal)} received`);
  setText("#balMonthBalance", `${fmtKes(balTotal)} arrears (end)`);
  setText("#balMonthRate", `${fmtPct(rate)} rent collection rate`);

  body.innerHTML = rows.map((r) => {
    const tenant = pickStr(r.tenant, r.full_name, r.tenant_name, r.unit_code) || "—";
    const due = pickNum(r.total_due, r.rent_due, r.invoiced_amt, r.subtotal_rent, 0);
    const paid = pickNum(r.paid_total, r.paid, r.collected_amt, 0);
    const bal = pickNum(r.balance, r.closing_balance, r.invoice_balance, r.lease_running_balance, 0);
    const cr = r.collection_rate ?? (due ? (paid / due) * 100 : 0);

    return `
      <tr>
        <td>${escapeHtml(tenant)}</td>
        <td class="num">${fmtKes(due)}</td>
        <td class="num">${fmtKes(paid)}</td>
        <td class="num">${fmtKes(bal)}</td>
        <td class="num">${fmtPct(cr)}</td>
      </tr>`;
  }).join("");
}

function renderOutstandingFromBalances() {
  const body = $("#outstandingBody");
  const empty = $("#outstandingEmpty");
  if (!body) return;

  const rows = (state.balances || [])
    .map((r) => {
      const tenant = pickStr(r.tenant, r.full_name, r.tenant_name, r.unit_code) || "—";
      const outstanding = pickNum(r.balance, r.closing_balance, r.invoice_balance, r.lease_running_balance, 0);
      const due = pickNum(r.total_due, r.rent_due, r.invoiced_amt, r.subtotal_rent, 0);
      const paid = pickNum(r.paid_total, r.paid, r.collected_amt, 0);
      const cr = r.collection_rate ?? (due ? (paid / due) * 100 : 0);
      return { tenant, outstanding, cr };
    })
    .filter((x) => x.outstanding > 0.0001)
    .sort((a, b) => b.outstanding - a.outstanding);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows.map((x) => `
    <tr>
      <td>${escapeHtml(x.tenant)}</td>
      <td class="num">${fmtKes(x.outstanding)}</td>
      <td class="num">${fmtPct(x.cr)}</td>
    </tr>
  `).join("");
}

/* ------------------------- Invoice Actions ------------------------- */

function initInvoiceActions() {
  const btnSent = $("#btnMarkSent");
  const btnHealth = $("#btnHealth");
  const input = $("#invoiceIdInput");
  const msg = $("#actionMsg");

  if (!btnSent || !btnHealth || !input || !msg) return;

  btnSent.addEventListener("click", async () => {
    const id = input.value.trim();
    if (!id) {
      msg.textContent = "Enter an invoice_id first.";
      return;
    }

    const token = window.getAdminToken();
    if (!token) {
      msg.textContent = "Admin token required.";
      return;
    }

    msg.textContent = "Marking invoice as sent…";

    try {
      const res = await fetch(`${apiBase()}/admin/mark_invoice_sent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": token
        },
        body: JSON.stringify({ invoice_id: id })
      });

      if (!res.ok) {
        msg.textContent = `Failed: ${res.status}`;
        return;
      }

      msg.textContent = "Invoice marked as sent.";
      input.value = "";
    } catch (e) {
      msg.textContent = "Network error.";
      console.warn(e);
    }
  });

  btnHealth.addEventListener("click", async () => {
    const token = window.getAdminToken();
    if (!token) {
      msg.textContent = "Admin token required.";
      return;
    }

    msg.textContent = "Checking auth…";

    try {
      const res = await fetch(`${apiBase()}/admin/health`, {
        headers: { "X-Admin-Token": token }
      });

      msg.textContent = res.ok ? "Auth OK" : `Auth failed (${res.status})`;
    } catch (e) {
      msg.textContent = "Network error.";
      console.warn(e);
    }
  });
}

/* ------------------------- Dunning initDunning------------------------- */
function initDunning() {
  $("#reloadDunning")?.addEventListener("click", () => loadDunning(true));
  $("#dunningMonth")?.addEventListener("change", () => loadDunning(true));
  $("#dunningSelectAll")?.addEventListener("change", (e) => {
    const checked = !!e.target.checked;
    document.querySelectorAll("input.dunning-check").forEach((cb) => cb.checked = checked);
  });

  const minDays = $("#dunningMinDaysOverdue");
  if (minDays) {
    minDays.addEventListener("input", () => {
      renderDunning(); // re-render with new filter
    });
  }

  $("#btnDunningBuildLinks")?.addEventListener("click", (e) => buildDunningLinks({ autoOpen: e.shiftKey }));
  $("#btnDunningMarkSent")?.addEventListener("click", () => markDunningSelectedAsSent());
}

function dunningMonth() {
  return currentMonthFor("#dunningMonth") || currentMonthFor("#balancesMonth") || state.month;
}

/* ------------------------- Dunning ------------------------- */
async function loadDunning(force = false) {
  try {
    const m = dunningMonth();
    const minDays = Number($("#dunningMinDaysOverdue")?.value || 0);

    const data = await apiGet(
      `/dunning?month=${encodeURIComponent(m)}&minDays=${minDays}`
    );

    state.dunning = unwrapRows(data);
    renderDunning();
  } catch (e) {
    console.warn("loadDunning failed:", e);
    state.dunning = [];
    renderDunning();
  }
}

function renderDunning() {
  const body = $("#dunningBody");
  const empty = $("#dunningEmpty");
  const msg = $("#dunningMsg");
  const links = $("#dunningLinks");
  const linksBody = $("#dunningLinksBody");

  if (linksBody) linksBody.innerHTML = "";
  if (links) hide(links);
  if (msg) msg.textContent = "";

  const m = dunningMonth();
  setText("#dunningMonthLabel", monthLabel(m));

  const rows = state.dunning || [];

  const countEl = $("#dunningInvoiceCount");
  if (countEl) {
    if (rows.length > 0) {
      countEl.classList.add("overdue-alert");
      setText("#dunningInvoiceCount", `${rows.length} overdue invoice${rows.length === 1 ? "" : "s"}`);
      show("#dunningInvoiceCount");
    } else {
      countEl.classList.remove("overdue-alert");
      setText("#dunningInvoiceCount", "");
      hide("#dunningInvoiceCount");
    }
  }

  setText("#dunningLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);

  if (body) body.innerHTML = "";
  hide("#dunningTip");

  if (!rows.length) {
    if (body) body.innerHTML = "";
    if (empty) show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows
    .map((r, idx) => {
      const wa = r.whatsapp_link
        ? `<a href="${r.whatsapp_link}" target="_blank" rel="noopener">WhatsApp</a>`
        : `<span class="muted">missing phone</span>`;

      return `
        <tr>
          <td><input class="dunning-check" type="checkbox" data-idx="${idx}" /></td>
          <td>${escapeHtml(r.tenant)}</td>
          <td class="num">${fmtKes(r.total_due)}</td>
          <td class="num">${fmtKes(r.balance)}</td>
          <td class="num">${r.days_overdue}</td>
          <td>${escapeHtml(r.bucket)}</td>
          <td>${wa}</td>
          <td class="muted mono">${escapeHtml(r.invoice_id)}</td>
        </tr>
      `;
    })
    .join("");

  const sa = $("#dunningSelectAll");
  if (sa) sa.checked = false;
}

function getSelectedDunningRows() {
  const rows = state.dunning || [];
  const out = [];

  document.querySelectorAll("input.dunning-check:checked").forEach((cb) => {
    const idx = Number(cb.dataset.idx);
    if (Number.isFinite(idx) && rows[idx]) {
      out.push(rows[idx]);
    }
  });

  return out;
}

/* ------------------------- WhatsApp Builder (ad-hoc) ------------------------- */
function initWhatsAppBuilder() {
  $("#waBuild")?.addEventListener("click", () => {
    const tenant = $("#waTenant")?.value || "tenant";
    const phone = normalizePhoneKE($("#waPhone")?.value || "");
    const period = $("#waPeriod")?.value || monthLabel(state.month);
    const bal = Number($("#waBalance")?.value || 0);

    if (!phone) {
      $("#waResult").innerHTML = `<span class="muted">Enter phone number first.</span>`;
      return;
    }

    const txt =
      `Hello ${tenant},\n` +
      `Your rent balance for ${period} is ${fmtKes(bal)}.\n` +
      `Kindly pay at your earliest convenience. Thank you.`;

    const href = buildWhatsAppLink(phone, txt);
    $("#waResult").innerHTML = `<a href="${href}" target="_blank" rel="noopener">Open WhatsApp message</a>`;
  });
}

function buildWhatsAppLink(phone2547, message) {
  const p = normalizePhoneKE(phone2547);
  const txt = encodeURIComponent(String(message || ""));
  return `https://wa.me/${p}?text=${txt}`;
}

/* ------------------------- Settings + Invoice Actions ------------------------- */
function initSettings() {
  const api2 = $("#apiBase2");
  const admin = $("#adminToken");

  const savedApi = localStorage.getItem("api_base") || "";
  if (api2) api2.value = savedApi;

  const savedToken = localStorage.getItem("admin_token") || "";
  if (admin) admin.value = savedToken;

  $("#saveSettings")?.addEventListener("click", () => {
    const v = (api2?.value || "").trim();
    if (v) {
      localStorage.setItem("api_base", v);
      state.apiBase = v;
      if ($("#apiBase")) $("#apiBase").value = v;
    }
    const t = (admin?.value || "").trim();
    localStorage.setItem("admin_token", t);
    setText("#actionMsg", "Saved ✅");
  });

  $("#resetSettings")?.addEventListener("click", () => {
    localStorage.removeItem("api_base");
    localStorage.removeItem("admin_token");
    state.apiBase = "";
    if ($("#apiBase")) $("#apiBase").value = "";
    if (api2) api2.value = "";
    if (admin) admin.value = "";
    setText("#actionMsg", "Reset ✅");
  });
}


document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initApiBaseControls();
  initMonthPicker();

  initLeases();
  initPayments();
  initInvoiceActions();
  initDunning();
  initRentRoll();

  // Load initial data for the dashboard
  loadOverview();
  loadDunning();
});
