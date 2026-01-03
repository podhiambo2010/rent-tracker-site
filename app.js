/* Rent Tracker Dashboard — app.js
 * Updated: 2026-01-01
 * Goals:
 * - Overview is summary only
 * - Leases has Apply/Clear and correct columns + ended status color
 * - Balances is analytics only (supports balances/by_unit shape)
 * - Dunning is action center (uses rentroll rows so invoice_id/lease_id exist)
 * - Invoice Actions moved to Settings tab (admin tools)
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
  // ym: YYYY-MM
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
}

function normalizePhoneKE(p) {
  // accepts 07.., 2547.., +2547.. => returns 2547....
  let s = String(p || "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("0")) s = "254" + s.slice(1);
  return s;
}

/* ------------------------- Response shape helpers ------------------------- */
function unwrapRows(data) {
  // Accept: array, {rows:[]}, {data:[]}, {items:[]}, {ok:true, rows/data/items}
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

async function apiGet(path) {
  const base = apiBase();
  if (!base) throw new Error("API base is empty");
  const url = base + path;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} -> HTTP ${res.status} ${body}`);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

async function apiPost(path, payload, { admin = false } = {}) {
  const base = apiBase();
  if (!base) throw new Error("API base is empty");

  const headers = { "Content-Type": "application/json" };
  if (admin) {
    const t = getAdminTokenFromStorage() || window.getAdminToken?.() || "";
    if (t) headers["X-Admin-Token"] = t;
  }

  const res = await fetch(base + path, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`POST ${path} -> HTTP ${res.status} ${body}`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function getAdminTokenFromStorage() {
  return localStorage.getItem("admin_token") || "";
}

/* ------------------------- Tabs ------------------------- */
function initTabs() {
  const tabs = Array.from(document.querySelectorAll("nav .tab"));
  const panels = Array.from(document.querySelectorAll('section > .panel[id^="tab-"]'));

  function activate(name) {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    panels.forEach((p) => {
      const is = p.id === `tab-${name}`;
      p.classList.toggle("hidden", !is);
    });
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

  // IMPORTANT: keep #monthPicker as a normal input type="month"
  if (mp) {
    mp.type = "month";
    mp.value = saved;
  }

  const months = buildRecentMonths(24);
  fillSelect("#paymentsMonth", months, saved);
  fillSelect("#rentrollMonth", months, saved);
  fillSelect("#balancesMonth", months, saved);

  if (mp) {
    mp.addEventListener("change", () => {
      state.month = mp.value || current;
      localStorage.setItem("month", state.month);

      setSelectValue("#paymentsMonth", state.month);
      setSelectValue("#rentrollMonth", state.month);
      setSelectValue("#balancesMonth", state.month);

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

/* ------------------------- Overview ------------------------- */
async function loadOverview() {
  try {
    const m = state.month;

    // Always prefer /dashboard/overview (it now returns both new+legacy keys)
    let d = {};
    try {
      d = await apiGet(`/dashboard/overview?month=${encodeURIComponent(m)}`);
    } catch (_) {
      d = {};
    }

    // Active leases
    const leasesCount =
      (Array.isArray(state.leases) && state.leases.length)
        ? state.leases.length
        : (d.total_leases ?? d.leases ?? d.total ?? null);

    // Open invoices KPI: compute from rentroll when possible
    let openInvoicesCount = null;
    try {
      const rrData = await apiGet(`/rentroll?month=${encodeURIComponent(m)}`);
      const rr = unwrapRows(rrData);
      openInvoicesCount = rr.filter((r) => pickNum(
        r.invoice_balance,
        r.lease_running_balance,
        r.balance,
        r.closing_balance,
        0
      ) > 0.0001).length;
    } catch (_) {
      openInvoicesCount = d.open_invoices ?? d.open ?? null;
    }

    // Month totals (billed / received / cash)
    const billedMonth = pickNum(
      d.total_due_month,
      d.rent_billed_month,      // subtotal_rent only
      d.invoiced_amt,
      d.total_due,
      0
    );

    const cashReceived = pickNum(
      d.cash_received_month,
      d.payments,
      d.collected_amt,
      d.total_collected,
      0
    );

    // “Overdue” should be positive-only arrears (what you must chase)
    const overdue = pickNum(
      d.overdue_total,
      d.balance_due,
      d.total_balance,
      d.closing_balance,
      0
    );

    const openingNet = (d.opening_balance_bf ?? null);
    const closingNet = (d.closing_balance_cf ?? null);

    const arrearsPaid = pickNum(d.collected_for_arrears, 0);
    const creditsTotal = pickNum(d.credit_total, d.overpayments_total, 0);

    const rentRate = pickNum(
      d.rent_collection_rate_pct,
      d.collection_rate,
      (billedMonth ? (cashReceived / billedMonth) * 100 : 0)
    );

    // KPIs
    setText("#kpiLeases", leasesCount != null ? String(leasesCount) : "—");
    setText("#kpiOpen", openInvoicesCount != null ? String(openInvoicesCount) : "—");
    setText("#kpiPayments", fmtKes(cashReceived));
    setText("#kpiBalance", fmtKes(overdue));

    // Monthly collection summary
    setText("#summaryMonthLabel", monthLabel(m));
    setText("#summaryMonthDue", `Rent billed (month) ${fmtKes(billedMonth)}`);
    setText("#summaryMonthCollected", `Rent received (month) ${fmtKes(cashReceived)}`);

    if ($("#summaryCashReceived")) {
      setText("#summaryCashReceived", `Cash received (month) ${fmtKes(cashReceived)}`);
    }

    if (openingNet != null && closingNet != null) {
      setText(
        "#summaryMonthBalance",
        `Balance at start (BF) ${fmtKes(openingNet)} • Balance at end (CF) ${fmtKes(closingNet)}`
      );
    } else if (closingNet != null) {
      setText("#summaryMonthBalance", `Balance at end (CF) ${fmtKes(closingNet)}`);
    } else {
      setText("#summaryMonthBalance", `Arrears (end) ${fmtKes(overdue)}`);
    }

    setText("#summaryMonthRate", `${fmtPct(rentRate)} Rent collection rate`);

    if ($("#summaryArrearsCleared")) {
      setText("#summaryArrearsCleared", `Arrears paid (month) ${fmtKes(arrearsPaid)}`);
    }

    if ($("#summaryOverpayments")) {
      // If backend returned top overpayer, use it (better than recomputing)
      const top = d.top_overpayer || {};
      if (creditsTotal > 0.0001) {
        const who = (top.unit && top.unit !== "-") ? top.unit : (top.tenant || "—");
        const amt = pickNum(top.amount, 0);
        setText(
          "#summaryOverpayments",
          `Tenant credit (prepaid) ${fmtKes(creditsTotal)} • Largest credit: ${who} ${fmtKes(amt)}`
        );
      } else {
        setText("#summaryOverpayments", `Tenant credit (prepaid) ${fmtKes(0)}`);
      }
    }
  } catch (e) {
    console.warn("loadOverview failed:", e);
  }
}

/* ------------------------- Leases ------------------------- */
function initLeases() {
  const applyBtn = $("#applyLeases");
  const clearBtn = $("#clearLeases");
  const reloadBtn = $("#reloadLeases");

  if (applyBtn) applyBtn.addEventListener("click", () => renderLeases());
  if (clearBtn) clearBtn.addEventListener("click", () => {
    const s = $("#leaseSearch");
    if (s) s.value = "";
    renderLeases();
  });

  if (reloadBtn) reloadBtn.addEventListener("click", () => loadLeases(true));

  const s = $("#leaseSearch");
  if (s) {
    s.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") renderLeases();
    });
  }
}

async function loadLeases(force = false) {
  try {
    if (!force && state.leases.length) return;
    const data = await apiGet("/leases");
    state.leases = unwrapRows(data);
    renderLeases();
    // Keep overview KPI correct even if leases load after overview
    loadOverview();
  } catch (e) {
    console.warn("loadLeases failed:", e);
    state.leases = [];
    renderLeases();
    loadOverview();
  }
}

function leaseStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "status";
  if (s.includes("active")) return "status ok";
  if (s.includes("ended") || s.includes("terminated") || s.includes("inactive") || s.includes("closed"))
    return "status ended";
  return "status";
}

function renderLeases() {
  const body = $("#leasesBody");
  const empty = $("#leasesEmpty");
  const count = $("#leasesCount");
  if (!body) return;

  const q = String($("#leaseSearch")?.value || "").trim().toLowerCase();
  const rows = (state.leases || []).filter((r) => {
    const tenant = (r.tenant || r.full_name || r.tenant_name || "").toLowerCase();
    const unit = (r.unit || r.unit_code || r.unit_name || "").toLowerCase();
    return !q || tenant.includes(q) || unit.includes(q);
  });

  setText(count, rows.length);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows
    .map((r) => {
      const tenant = r.tenant || r.full_name || r.tenant_name || "—";
      const unit = r.unit || r.unit_code || r.unit_name || "—";
      const rent = r.rent ?? r.rent_amount ?? r.monthly_rent ?? null;
      const cycle = r.cycle || r.billing_cycle || r.rent_cycle || "—";
      const dueDay = r.due_day ?? r.dueDay ?? r.due_date ?? "—";
      const status = r.status || r.lease_status || "—";
      const phone = r.phone || r.msisdn || r.whatsapp_phone || "";

      const waLink = phone ? buildWhatsAppLink(normalizePhoneKE(phone), `Hello ${tenant},`) : "";

      return `
      <tr>
        <td>${escapeHtml(tenant)}</td>
        <td>${escapeHtml(unit)}</td>
        <td class="num">${rent != null ? fmtKes(rent) : "—"}</td>
        <td>${escapeHtml(cycle)}</td>
        <td>${escapeHtml(dueDay)}</td>
        <td><span class="${leaseStatusClass(status)}">${escapeHtml(status)}</span></td>
        <td>
          ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted">—</span>`}
        </td>
      </tr>`;
    })
    .join("");
}

/* ------------------------- Payments ------------------------- */
function initPayments() {
  $("#applyPayments")?.addEventListener("click", () => loadPayments(true));
  $("#clearPayments")?.addEventListener("click", () => {
    setSelectValue("#paymentsMonth", state.month);
    const t = $("#paymentsTenant");
    if (t) t.value = "";
    const s = $("#paymentsStatus");
    if (s) s.value = "";
    loadPayments(true);
  });
}

async function loadPayments(force = false) {
  try {
    const m = currentMonthFor("#paymentsMonth");

    let data;
    try {
      data = await apiGet(`/payments?month=${encodeURIComponent(m)}`);
    } catch (_) {
      data = await apiGet(`/dashboard/payments?month=${encodeURIComponent(m)}`);
    }

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

  body.innerHTML = rows
    .map((r) => {
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
    })
    .join("");
}

/* ------------------------- Rent Roll ------------------------- */
function initRentRoll() {
  $("#applyRentroll")?.addEventListener("click", () => loadRentRoll(true));
  $("#clearRentroll")?.addEventListener("click", () => {
    setSelectValue("#rentrollMonth", state.month);
    const t = $("#rentrollTenant");
    if (t) t.value = "";
    const p = $("#rentrollProperty");
    if (p) p.value = "";
    loadRentRoll(true);
  });
}

async function loadRentRoll(force = false) {
  try {
    const m = currentMonthFor("#rentrollMonth");

    let data;
    try {
      data = await apiGet(`/rentroll?month=${encodeURIComponent(m)}`);
    } catch (_) {
      data = await apiGet(`/dashboard/rentroll?month=${encodeURIComponent(m)}`);
    }

    state.rentroll = unwrapRows(data);
    renderRentRoll();

    // Keep overview "open invoices" correct even if rentroll loads after overview
    loadOverview();
  } catch (e) {
    console.warn("loadRentRoll failed:", e);
    state.rentroll = [];
    renderRentRoll();
    loadOverview();
  }
}

function renderRentRoll() {
  const body = $("#rentrollBody");
  const empty = $("#rentrollEmpty");
  if (!body) return;

  const m = currentMonthFor("#rentrollMonth");

  const qT = String($("#rentrollTenant")?.value || "").trim().toLowerCase();
  const qP = String($("#rentrollProperty")?.value || "").trim().toLowerCase();

  const rows = (state.rentroll || []).filter((r) => {
    const tenantLike = (r.tenant || r.full_name || r.tenant_name || r.unit_code || "").toLowerCase();
    const prop = (r.property || r.property_name || "").toLowerCase();
    return (!qT || tenantLike.includes(qT)) && (!qP || prop.includes(qP));
  });

  setText("#rentrollCount", rows.length);

  const dueTotal = sum(rows, (r) => pickNum(r.total_due, r.rent_due, r.subtotal_rent, r.rent, r.invoiced_amt, 0));
  const paidTotal = sum(rows, (r) => pickNum(r.paid_total, r.paid, r.collected_amt, r.paid_amt, 0));
  const balTotal = sum(rows, (r) =>
    pickNum(r.invoice_balance, r.lease_running_balance, r.balance, r.closing_balance, r.month_delta, 0)
  );
  const creditTotal = sum(rows, (r) => pickNum(r.credits, r.credit, r.credit_amt, 0));

  setText("#rentrollDueChip", `${fmtKes(dueTotal)} billed`);
  setText("#rentrollPaidChip", `${fmtKes(paidTotal)} received`);
  setText("#rentrollBalChip", `${fmtKes(balTotal)} overdue`);
  setText("#rentrollCreditChip", `${fmtKes(creditTotal)} prepaid credit`);


  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows
    .map((r) => {
      const property = r.property || r.property_name || "—";
      const unit = r.unit || r.unit_code || "—";
      const tenant = pickStr(r.tenant, r.full_name, r.tenant_name, r.unit_code) || "—";

      const period =
        r.period ||
        r.period_label ||
        (r.period_start && r.period_end
          ? `${String(r.period_start).slice(0, 10)} → ${String(r.period_end).slice(0, 10)}`
          : m);

      const rent = pickNum(r.total_due, r.rent_due, r.subtotal_rent, r.rent, r.invoiced_amt, 0);
      const late = pickNum(r.late_fees, r.late_fee, 0);
      const bal = pickNum(r.invoice_balance, r.lease_running_balance, r.balance, r.closing_balance, 0);

      const status = r.status || (bal > 0 ? "due" : "ok");

      const leaseId = r.lease_id || r.leaseId || "";
      const invoiceId = r.invoice_id || r.invoiceId || "";

      const waUrl =
        r.wa_url ||
        (leaseId ? `${apiBase()}/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(leaseId)}&month=${encodeURIComponent(m)}` : "") ||
        (invoiceId ? `${apiBase()}/wa_for_rentroll_redirect?invoice_id=${encodeURIComponent(invoiceId)}` : "");

      return `
      <tr>
        <td>${escapeHtml(property)}</td>
        <td>${escapeHtml(unit)}</td>
        <td>${escapeHtml(tenant)}</td>
        <td>${escapeHtml(String(period))}</td>
        <td class="num">${fmtKes(rent)}</td>
        <td class="num">${fmtKes(late)}</td>
        <td><span class="status ${String(status).toLowerCase().includes("ok") ? "ok" : "due"}">${escapeHtml(status)}</span></td>
        <td class="num">${fmtKes(bal)}</td>
        <td>
          ${waUrl ? `<a href="${waUrl}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted">—</span>`}
        </td>
      </tr>`;
    })
    .join("");
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
      const m = currentMonthFor("#balancesMonth");
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
    const m = currentMonthFor("#balancesMonth");

    const data = await apiGet(`/balances/by_unit?month=${encodeURIComponent(m)}`);
    state.balances = unwrapRows(data);

    renderBalances();
    renderOutstandingFromBalances();

    setText("#balMonthLabel", monthLabel(m));    
    setText("#outstandingMonthLabel", monthLabel(m));
    setText("#balancesLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);
    setText("#outstandingLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);

    // Keep overview credits/overpayments correct if user is on overview
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


  body.innerHTML = rows
    .map((r) => {
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
    })
    .join("");
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
      return { tenant, outstanding, cr, raw: r };
    })
    .filter((x) => x.outstanding > 0.0001)
    .sort((a, b) => b.outstanding - a.outstanding);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows
    .map(
      (x) => `
    <tr>
      <td>${escapeHtml(x.tenant)}</td>
      <td class="num">${fmtKes(x.outstanding)}</td>
      <td class="num">${fmtPct(x.cr)}</td>
    </tr>`
    )
    .join("");
}

/* ------------------------- Dunning (Action Center) ------------------------- */
function initDunning() {
  $("#reloadDunning")?.addEventListener("click", () => loadDunning(true));

  $("#dunningSelectAll")?.addEventListener("change", (e) => {
    const checked = !!e.target.checked;
    document.querySelectorAll("input.dunning-check").forEach((cb) => {
      cb.checked = checked;
    });
  });

  $("#btnDunningBuildLinks")?.addEventListener("click", () => buildDunningLinks());
  $("#btnDunningMarkSent")?.addEventListener("click", () => markDunningSelectedAsSent());
}

function dunningMonth() {
  return currentMonthFor("#balancesMonth") || state.month;
}

async function loadDunning(force = false) {
  try {
    const m = dunningMonth();
    setSelectValue("#rentrollMonth", m);

    if (force || !state.rentroll.length) {
      await loadRentRoll(true);
    }
    renderDunning();
  } catch (e) {
    console.warn("loadDunning failed:", e);
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
  setText("#dunningLastUpdated", `Last updated: ${new Date().toLocaleString("en-GB")}`);

  if (!body) return;

  const rows = (state.rentroll || [])
    .map((r) => {
      const tenant = pickStr(r.tenant, r.full_name, r.tenant_name, r.unit_code) || "—";
      const outstanding = pickNum(r.invoice_balance, r.lease_running_balance, r.balance, r.closing_balance, 0);
      const due = pickNum(r.total_due, r.rent_due, r.subtotal_rent, r.rent, r.invoiced_amt, 0);
      const paid = pickNum(r.paid_total, r.paid, r.collected_amt, r.paid_amt, 0);
      const cr = due ? (paid / due) * 100 : 0;

      const invoiceId = r.invoice_id || r.invoiceId || "";
      const leaseId = r.lease_id || r.leaseId || "";
      const phone = normalizePhoneKE(r.phone || r.msisdn || r.whatsapp_phone || "");

      return { tenant, outstanding, cr, invoiceId, leaseId, phone, raw: r };
    })
    .filter((x) => x.outstanding > 0.0001)
    .sort((a, b) => b.outstanding - a.outstanding);

  if (!rows.length) {
    body.innerHTML = "";
    show(empty);
    return;
  }
  hide(empty);

  body.innerHTML = rows
    .map((x, i) => {
      const period = monthLabel(m);
      const txt =
        `Hello ${x.tenant},\n` +
        `This is a gentle reminder that your rent balance for ${period} is ${fmtKes(x.outstanding)}.\n` +
        `Kindly pay at your earliest convenience. Thank you.`;

      const waRedirect =
        x.leaseId
          ? `${apiBase()}/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(x.leaseId)}&month=${encodeURIComponent(m)}`
          : x.invoiceId
          ? `${apiBase()}/wa_for_rentroll_redirect?invoice_id=${encodeURIComponent(x.invoiceId)}`
          : "";

      const waDirect = x.phone ? buildWhatsAppLink(x.phone, txt) : "";
      const waHref = waRedirect || waDirect;

      return `
      <tr>
        <td><input class="dunning-check" type="checkbox" data-idx="${i}" /></td>
        <td>${escapeHtml(x.tenant)}</td>
        <td class="num">${fmtKes(x.outstanding)}</td>
        <td class="num">${fmtPct(x.cr)}</td>
        <td>${waHref ? `<a href="${waHref}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="muted">—</span>`}</td>
        <td class="muted">${x.invoiceId ? escapeHtml(x.invoiceId) : "—"}</td>
      </tr>`;
    })
    .join("");
}

function getSelectedDunningRows() {
  const checks = Array.from(document.querySelectorAll("input.dunning-check:checked"));
  const m = dunningMonth();

  const all = (state.rentroll || [])
    .map((r) => {
      const tenant = pickStr(r.tenant, r.full_name, r.tenant_name, r.unit_code) || "—";
      const outstanding = pickNum(r.invoice_balance, r.lease_running_balance, r.balance, r.closing_balance, 0);
      const invoiceId = r.invoice_id || r.invoiceId || "";
      const leaseId = r.lease_id || r.leaseId || "";
      const phone = normalizePhoneKE(r.phone || r.msisdn || r.whatsapp_phone || "");
      return { tenant, outstanding, invoiceId, leaseId, phone, raw: r, month: m };
    })
    .filter((x) => x.outstanding > 0.0001)
    .sort((a, b) => b.outstanding - a.outstanding);

  return checks.map((cb) => all[Number(cb.dataset.idx)]).filter(Boolean);
}

function buildDunningLinks() {
  const msg = $("#dunningMsg");
  const links = $("#dunningLinks");
  const linksBody = $("#dunningLinksBody");
  if (!linksBody || !links || !msg) return;

  const selected = getSelectedDunningRows();
  if (!selected.length) {
    msg.textContent = "Select at least one tenant first.";
    return;
  }

  const dm = dunningMonth();
  const period = monthLabel(dm);

  const items = selected.map((x) => {
    const txt =
      `Hello ${x.tenant},\n` +
      `This is a gentle reminder that your rent balance for ${period} is ${fmtKes(x.outstanding)}.\n` +
      `Kindly pay at your earliest convenience. Thank you.`;

    const waRedirect =
      x.leaseId
        ? `${apiBase()}/wa_for_rentroll_redirect?lease_id=${encodeURIComponent(x.leaseId)}&month=${encodeURIComponent(dm)}`
        : x.invoiceId
        ? `${apiBase()}/wa_for_rentroll_redirect?invoice_id=${encodeURIComponent(x.invoiceId)}`
        : "";

    const waDirect = x.phone ? buildWhatsAppLink(x.phone, txt) : "";
    const href = waRedirect || waDirect;

    return href
      ? `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(x.tenant)} — ${fmtKes(x.outstanding)}</a>`
      : `<div class="muted">${escapeHtml(x.tenant)} — missing phone/ids</div>`;
  });

  linksBody.innerHTML = items.join("");
  show(links);
  msg.textContent = `Built ${selected.length} link(s). Click them below to send (avoids pop-up blockers).`;
}

async function markDunningSelectedAsSent() {
  const msg = $("#dunningMsg");
  if (!msg) return;

  const selected = getSelectedDunningRows();
  const invoiceIds = selected.map((x) => x.invoiceId).filter(Boolean);

  if (!selected.length) {
    msg.textContent = "Select at least one tenant first.";
    return;
  }
  if (!invoiceIds.length) {
    msg.textContent = "Selected rows have no invoice_id (cannot mark sent).";
    return;
  }

  msg.textContent = "Marking selected invoices as sent…";

  try {
    try {
      await apiPost("/invoices/mark_sent", { invoice_ids: invoiceIds }, { admin: true });
    } catch (_) {
      await apiPost("/admin/invoices/mark_sent", { invoice_ids: invoiceIds }, { admin: true });
    }
    msg.textContent = `Marked ${invoiceIds.length} invoice(s) as sent ✅`;
  } catch (e) {
    msg.textContent = `Failed: ${e.message}`;
  }
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

function initInvoiceActions() {
  const healthBtn = $("#btnHealth");
  const markBtn = $("#btnMarkSent");
  const input = $("#invoiceIdInput");
  const msg = $("#actionMsg");

  const setMsg = (t) => {
    if (msg) msg.textContent = t;
  };

  if (healthBtn) {
    healthBtn.addEventListener("click", async () => {
      setMsg("Checking admin token…");
      try {
        const headers = {};
        const t = getAdminTokenFromStorage() || window.getAdminToken?.() || "";
        if (t) headers["X-Admin-Token"] = t;

        const base = apiBase();
        if (!base) throw new Error("Set API base first.");

        const res = await fetch(base + "/admin/ping", { headers });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${body}`);
        }
        setMsg("Admin token OK ✅");
      } catch (e) {
        setMsg(`Ping failed: ${e.message}`);
      }
    });
  }

  if (markBtn) {
    markBtn.addEventListener("click", async () => {
      const invoice_id = (input?.value || "").trim();
      if (!invoice_id) return setMsg("Enter invoice_id first.");
      setMsg("Marking invoice as sent…");
      try {
        try {
          await apiPost("/invoices/mark_sent", { invoice_ids: [invoice_id] }, { admin: true });
        } catch (_) {
          await apiPost("/admin/invoices/mark_sent", { invoice_ids: [invoice_id] }, { admin: true });
        }
        setMsg("Marked as sent ✅");
      } catch (e) {
        setMsg(`Failed: ${e.message}`);
      }
    });
  }
}

/* ------------------------- Init ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initApiBaseControls();
  initMonthPicker();

  initLeases();
  initPayments();
  initRentRoll();
  initBalances();
  initDunning();
  initWhatsAppBuilder();
  initSettings();
  initInvoiceActions();

  loadOverview();
  loadLeases(true);
  loadPayments(true);
  loadRentRoll(true);
  loadBalances(true);
  loadDunning(true);
});
