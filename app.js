/* Rent Tracker Dashboard UI (no framework)
   - Works with the HTML ids in index.html
   - Designed to be tolerant to small backend schema changes by checking multiple possible field names.
*/

/* ------------------------- Helpers ------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  apiBase: localStorage.getItem("api_base") || "",
  month: localStorage.getItem("month") || "", // "YYYY-MM"
  activeTab: localStorage.getItem("active_tab") || "overview",
};

function clampStr(s, n = 120) {
  const t = (s ?? "").toString();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function fmtKES(x) {
  const n = Number(x || 0);
  try {
    return "KES " + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch {
    return "KES " + Math.round(n).toString();
  }
}

function fmtKES2(x) {
  const n = Number(x || 0);
  try {
    return "KES " + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "KES " + n.toFixed(2);
  }
}

function fmtPct(x) {
  const n = Number(x || 0);
  if (!isFinite(n)) return "0.0%";
  return (n * 100).toFixed(1) + "%";
}

function monthLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function normalizePhone(raw) {
  const s = (raw || "").toString().trim();
  if (!s) return "";
  let t = s.replace(/[^\d+]/g, "");
  if (t.startsWith("+")) t = t.slice(1);
  if (t.startsWith("0")) t = "254" + t.slice(1);
  // if someone pasted 7xxxxxxxx, assume Kenya
  if (t.length === 9 && t.startsWith("7")) t = "254" + t;
  return t;
}

function buildWhatsAppUrl({ phone, text }) {
  const p = normalizePhone(phone);
  const base = p ? `https://wa.me/${p}` : "https://wa.me/";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return base + q;
}

function setText(id, v) {
  const el = typeof id === "string" ? $(id) : id;
  if (el) el.textContent = v ?? "—";
}

function show(el, yes) {
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

function safeUrlJoin(base, path) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "").replace(/^\/+/, "");
  return b && p ? `${b}/${p}` : (b || "") + (p ? "/" + p : "");
}

/* ------------------------- API ------------------------- */
async function apiGet(path, params = {}) {
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is empty. Click “Use this API” after pasting the API URL.");
  const url = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof payload === "string" ? payload : (payload?.error || JSON.stringify(payload));
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return payload;
}

async function apiPost(path, body = {}, { admin = false } = {}) {
  const base = (state.apiBase || "").replace(/\/+$/, "");
  if (!base) throw new Error("API base is empty. Click “Use this API” after pasting the API URL.");
  const headers = { "Content-Type": "application/json", "Accept": "application/json" };
  if (admin) {
    const t = (window.getAdminToken ? window.getAdminToken() : "") || localStorage.getItem("admin_token") || "";
    if (t) headers["X-Admin-Token"] = t;
  }
  const res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof payload === "string" ? payload : (payload?.error || JSON.stringify(payload));
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return payload;
}

/* ------------------------- Init ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initApiBaseControls();
  initMonthPicker();
  initLeases();              // safe: function defined in this file
  initPayments();
  initRentRoll();
  initBalances();
  initDunning();
  initWhatsAppBuilder();
  initSettings();
  initInvoiceActions();

  // First load
  refreshAllLight();
});

/* ------------------------- Navigation / Tabs ------------------------- */
function initTabs() {
  const tabs = $$(".tab[data-tab]");
  tabs.forEach(t => {
    t.addEventListener("click", () => setActiveTab(t.dataset.tab));
  });
  setActiveTab(state.activeTab, { silent: true });
}

function setActiveTab(tabName, { silent = false } = {}) {
  state.activeTab = tabName;
  localStorage.setItem("active_tab", tabName);

  $$(".tab[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === tabName)));
  $$("section > .panel").forEach(p => p.classList.add("hidden"));
  const panel = $(`#tab-${tabName}`);
  if (panel) panel.classList.remove("hidden");

  if (!silent) refreshActiveTab();
}

function refreshActiveTab() {
  switch (state.activeTab) {
    case "overview": return loadOverview();
    case "leases": return loadLeases(true);
    case "payments": return loadPayments(true);
    case "rentroll": return loadRentRoll(true);
    case "balances": return loadBalances(true);
    case "dunning": return loadDunning(true);
    default: return;
  }
}

function refreshAllLight() {
  // Overview always drives month + top-level sanity
  loadOverview().catch(console.error);

  // Populate month dropdowns in the background then refresh the active tab
  loadMonthsIntoSelects().then(() => {
    syncMonthControlsToState();
    refreshActiveTab();
  }).catch(() => {
    syncMonthControlsToState();
    refreshActiveTab();
  });
}

/* ------------------------- API Base Controls ------------------------- */
function initApiBaseControls() {
  const input = $("#apiBase");
  const input2 = $("#apiBase2");
  const useBtn = $("#useApi");
  const docsBtn = $("#openDocs");

  if (input) input.value = state.apiBase || "";
  if (input2) input2.value = state.apiBase || "";

  if (useBtn) {
    useBtn.addEventListener("click", () => {
      const v = (input?.value || "").trim().replace(/\/+$/, "");
      if (!v) return alert("Paste your API base URL first (e.g. https://rent-tracker-api-xxxx.onrender.com)");
      state.apiBase = v;
      localStorage.setItem("api_base", v);
      if (input2) input2.value = v;
      refreshAllLight();
    });
  }

  if (docsBtn) {
    docsBtn.addEventListener("click", () => {
      const base = (state.apiBase || input?.value || "").trim().replace(/\/+$/, "");
      if (!base) return alert("Set API base first.");
      window.open(base + "/docs", "_blank");
    });
  }
}

/* ------------------------- Month Picker ------------------------- */
function initMonthPicker() {
  const mp = $("#monthPicker");
  if (!mp) return;

  if (!state.month) {
    // Default to current month in user's locale
    const d = new Date();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    state.month = ym;
    localStorage.setItem("month", ym);
  }
  mp.value = state.month;

  mp.addEventListener("change", () => {
    const v = mp.value;
    if (!v) return;
    state.month = v;
    localStorage.setItem("month", v);
    syncMonthControlsToState();
    refreshActiveTab();
    // Dunning label should always follow the current month.
    updateMonthLabelsEverywhere();
  });
}

function syncMonthControlsToState() {
  // Keep dropdown selects aligned with the global month picker when possible.
  const maps = [
    ["#rentrollMonth", state.month],
    ["#balancesMonth", state.month],
    ["#paymentsMonth", state.month],
  ];
  for (const [sel, m] of maps) {
    const el = $(sel);
    if (!el || !m) continue;
    // only set if option exists
    const opt = Array.from(el.options).find(o => o.value === m);
    if (opt) el.value = m;
  }
  updateMonthLabelsEverywhere();
}

function updateMonthLabelsEverywhere() {
  setText("#summaryMonthLabel", monthLabel(state.month));
  setText("#balMonthLabel", monthLabel(state.month));
  setText("#outstandingMonthLabel", monthLabel(state.month));
  setText("#dunningMonthLabel", monthLabel(state.month));
}

/* ------------------------- Months (dropdowns) ------------------------- */
async function loadMonthsIntoSelects() {
  const months = await apiGet("/months").catch(() => []);
  const list = Array.isArray(months) ? months : (months?.months || []);
  const unique = Array.from(new Set(list)).filter(x => /^\d{4}-\d{2}$/.test(x));
  unique.sort().reverse();

  const selects = ["#rentrollMonth", "#balancesMonth", "#paymentsMonth"];
  for (const sel of selects) {
    const el = $(sel);
    if (!el) continue;
    const prev = el.value;
    el.innerHTML = "";
    unique.forEach(m => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = monthLabel(m);
      el.appendChild(o);
    });
    if (prev && unique.includes(prev)) el.value = prev;
  }

  // If our state.month is not available, pick latest available
  if (unique.length && (!state.month || !unique.includes(state.month))) {
    state.month = unique[0];
    localStorage.setItem("month", state.month);
    const mp = $("#monthPicker");
    if (mp) mp.value = state.month;
  }

  // Wire change handlers (after options exist)
  const rr = $("#rentrollMonth");
  if (rr && !rr.dataset.bound) {
    rr.dataset.bound = "1";
    rr.addEventListener("change", () => {
      if (rr.value) {
        state.month = rr.value;
        localStorage.setItem("month", state.month);
        const mp = $("#monthPicker");
        if (mp) mp.value = state.month;
        syncMonthControlsToState();
        loadRentRoll(true);
        loadOverview(); // keep summary aligned
      }
    });
  }
  const bm = $("#balancesMonth");
  if (bm && !bm.dataset.bound) {
    bm.dataset.bound = "1";
    bm.addEventListener("change", () => {
      if (bm.value) {
        state.month = bm.value;
        localStorage.setItem("month", state.month);
        const mp = $("#monthPicker");
        if (mp) mp.value = state.month;
        syncMonthControlsToState();
        loadBalances(true);
        loadOverview();
      }
    });
  }
  const pm = $("#paymentsMonth");
  if (pm && !pm.dataset.bound) {
    pm.dataset.bound = "1";
    pm.addEventListener("change", () => {
      if (pm.value) {
        state.month = pm.value;
        localStorage.setItem("month", state.month);
        const mp = $("#monthPicker");
        if (mp) mp.value = state.month;
        syncMonthControlsToState();
        loadPayments(true);
        loadOverview();
      }
    });
  }
}

/* ------------------------- Overview ------------------------- */
async function loadOverview() {
  updateMonthLabelsEverywhere();
  try {
    const m = state.month;
    const data = await apiGet("/dashboard/overview", { month: m });

    // These keys are based on your screenshots and earlier JSON.
    setText("#kpiLeases", data.active_leases ?? data.leases_active ?? "—");
    setText("#kpiOpen", data.open_invoices_month ?? data.unpaid_invoices_month ?? "—");
    setText("#kpiPayments", fmtKES(data.rent_received_month ?? data.rent_paid_month ?? 0));
    setText("#kpiBalance", fmtKES(data.total_due_month ?? data.rent_overdue_month ?? data.overdue_month ?? 0));

    const billed = Number(data.rent_billed_month ?? data.total_due_month ?? 0);
    const received = Number(data.rent_received_month ?? 0);
    const cash = Number(data.cash_received_month ?? received ?? 0);

    setText("#summaryMonthDue", `Rent billed (month) ${fmtKES(billed)}`);
    setText("#summaryMonthCollected", `Rent received (month) ${fmtKES(received)}`);
    setText("#summaryCashReceived", `Cash received (month) ${fmtKES(cash)}`);

    const arrearsStart = Number(data.arrears_start ?? data.arrears_open ?? 0);
    const arrearsEnd = Number(data.arrears_end ?? data.arrears_close ?? data.arrears_end_month ?? 0);
    setText("#summaryMonthBalance", `Arrears (start/end) ${fmtKES(arrearsStart)} / ${fmtKES(arrearsEnd)}`);

    const rate = data.rent_collection_rate_month ?? data.collection_rate_month ?? (billed > 0 ? received / billed : 0);
    setText("#summaryMonthRate", `Rent collection rate ${fmtPct(rate)}`);

    const arrearsCleared = Number(data.arrears_cleared_month ?? 0);
    setText("#summaryArrearsCleared", `Arrears paid (month) ${fmtKES(arrearsCleared)}`);

    const overpay = Number(data.prepaid_credit_month ?? data.tenant_credit_month ?? 0);
    setText("#summaryOverpayments", `Tenant credit (prepaid) ${fmtKES(overpay)}`);
  } catch (e) {
    console.error(e);
  }
}

/* ------------------------- Leases ------------------------- */
function initLeases() {
  const apply = $("#applyLeases");
  const clear = $("#clearLeases");
  const reload = $("#reloadLeases");

  if (apply) apply.addEventListener("click", () => loadLeases(true));
  if (clear) clear.addEventListener("click", () => { $("#leaseSearch").value = ""; loadLeases(true); });
  if (reload) reload.addEventListener("click", () => loadLeases(true));
}

async function loadLeases() {
  const tbody = $("#leasesBody");
  const empty = $("#leasesEmpty");
  const count = $("#leasesCount");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);

  try {
    const q = ($("#leaseSearch")?.value || "").trim();
    const data = await apiGet("/dashboard/leases", { q });
    const rows = data.rows || data || [];

    setText(count, rows.length);

    if (!rows.length) { show(empty, true); return; }

    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const tenant = r.tenant_name || r.tenant || r.full_name || "—";
      const unit = r.unit_code || r.unit || "—";
      const rent = r.rent_amount ?? r.rent ?? 0;
      const cycle = r.billing_cycle || r.cycle || "—";
      const due = r.due_day ?? r.due_date ?? "—";
      const status = r.status || (r.end_date ? "ended" : "active");
      const phone = r.phone || r.tenant_phone || "";

      tr.innerHTML = `
        <td>${clampStr(tenant, 50)}</td>
        <td>${clampStr(unit, 20)}</td>
        <td class="num">${fmtKES(rent)}</td>
        <td>${clampStr(cycle, 12)}</td>
        <td>${clampStr(due, 12)}</td>
        <td>${renderStatus(status)}</td>
        <td>${renderWhatsAppLink({ tenant, phone, period: monthLabel(state.month), balance: 0 })}</td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load leases: ${e.message}`);
  }
}

/* ------------------------- Payments ------------------------- */
function initPayments() {
  const apply = $("#applyPayments");
  const clear = $("#clearPayments");

  if (apply) apply.addEventListener("click", () => loadPayments(true));
  if (clear) clear.addEventListener("click", () => {
    $("#paymentsTenant").value = "";
    $("#paymentsStatus").value = "";
    loadPayments(true);
  });
}

async function loadPayments() {
  const tbody = $("#paymentsBody");
  const empty = $("#paymentsEmpty");
  const count = $("#paymentsCount");
  const countChip = $("#paymentsCountChip");
  const totalChip = $("#paymentsTotalChip");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);

  try {
    const m = ($("#paymentsMonth")?.value || state.month || "").trim();
    const tenant = ($("#paymentsTenant")?.value || "").trim();
    const status = ($("#paymentsStatus")?.value || "").trim();

    const data = await apiGet("/dashboard/payments", { month: m, tenant, status });
    const rows = data.rows || data || [];

    setText(count, rows.length);
    setText(countChip, rows.length);

    let total = 0;
    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const tr = document.createElement("tr");
      const dt = r.paid_at || r.date || r.created_at || "";
      const payer = r.tenant_name || r.tenant || r.payer || r.payer_name || "—";
      const method = r.method || r.channel || "—";
      const st = r.status || "—";
      const amt = Number(r.amount || r.paid_amount || 0);
      total += amt;

      tr.innerHTML = `
        <td>${clampStr(dt, 20)}</td>
        <td>${clampStr(payer, 50)}</td>
        <td>${clampStr(method, 16)}</td>
        <td class="muted">${clampStr(st, 16)}</td>
        <td class="num">${fmtKES2(amt)}</td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
    setText(totalChip, fmtKES2(total));

    if (!rows.length) show(empty, true);
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load payments: ${e.message}`);
  }
}

/* ------------------------- Rent Roll ------------------------- */
function initRentRoll() {
  const apply = $("#applyRentroll");
  const clear = $("#clearRentroll");
  if (apply) apply.addEventListener("click", () => loadRentRoll(true));
  if (clear) clear.addEventListener("click", () => {
    $("#rentrollTenant").value = "";
    $("#rentrollProperty").value = "";
    loadRentRoll(true);
  });
}

async function loadRentRoll() {
  const tbody = $("#rentrollBody");
  const empty = $("#rentrollEmpty");
  const count = $("#rentrollCount");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);

  try {
    const m = ($("#rentrollMonth")?.value || state.month || "").trim();
    const tenant = ($("#rentrollTenant")?.value || "").trim();
    const property = ($("#rentrollProperty")?.value || "").trim();

    const data = await apiGet("/dashboard/rentroll", { month: m, tenant, property });
    const rows = data.rows || data || [];

    setText(count, rows.length);

    // Totals
    let billed = 0, paid = 0, overdue = 0, credit = 0;

    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const tr = document.createElement("tr");

      const prop = r.property_name || r.property || "—";
      const unit = r.unit_code || r.unit || "—";
      const tn = r.tenant_name || r.tenant || r.full_name || "—";
      const ps = r.period_start || r.start || "";
      const pe = r.period_end || r.end || "";
      const period = ps && pe ? `${ps} → ${pe}` : (r.period || "—");

      const rent = Number(r.subtotal_rent ?? r.rent ?? 0);
      const late = Number(r.late_fees ?? r.late_fee ?? 0);
      const totalDue = Number(r.total_due ?? (rent + late) ?? 0);
      const paidTotal = Number(r.paid_total ?? r.paid ?? 0);
      const bal = Number(r.invoice_balance ?? r.balance ?? 0);

      billed += totalDue;
      paid += paidTotal;
      if (bal > 0) overdue += bal;
      if (bal < 0) credit += Math.abs(bal);

      const status = bal > 0 ? "due" : (bal < 0 ? "ok" : "ok");
      const invoiceId = r.invoice_id || r.invoice || "";
      const phone = r.tenant_phone || r.phone || "";
      const wa = renderWhatsAppLink({
        tenant: tn,
        phone,
        period: monthLabel(m),
        balance: bal > 0 ? bal : 0,
      });

      tr.innerHTML = `
        <td>${clampStr(prop, 40)}</td>
        <td>${clampStr(unit, 12)}</td>
        <td>${clampStr(tn, 45)}</td>
        <td>${clampStr(period, 28)}</td>
        <td class="num">${fmtKES2(rent)}</td>
        <td class="num">${fmtKES2(late)}</td>
        <td>${renderStatus(status)}</td>
        <td class="num">${fmtKES2(bal)}</td>
        <td>${invoiceId ? `<a href="#" data-invoice="${invoiceId}" class="waLink">WhatsApp</a>` : wa}</td>
      `;

      // If the backend does not provide tenant_phone, still keep the link usable by opening
      // the standard WhatsApp builder tab prefilled (no phone, but message ready).
      tr.querySelector("a.waLink")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        const message = defaultDunningText({ tenant: tn, period: monthLabel(m), overdue: (bal > 0 ? bal : 0) });
        const url = buildWhatsAppUrl({ phone, text: message });
        window.open(url, "_blank");
      });

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    setText("#rentrollDueChip", `${fmtKES(billed)} billed`);
    setText("#rentrollPaidChip", `${fmtKES(paid)} received`);
    setText("#rentrollBalChip", `${fmtKES(overdue)} overdue`);
    setText("#rentrollCreditChip", `${fmtKES(credit)} prepaid credit`);

    if (!rows.length) show(empty, true);
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load rent roll: ${e.message}`);
  }
}

/* ------------------------- Balances ------------------------- */
function initBalances() {
  $("#reloadBalances")?.addEventListener("click", () => loadBalances(true));
  $("#reloadOutstandingByTenant")?.addEventListener("click", () => loadOutstandingByTenant(true));
  $("#btnExportBalances")?.addEventListener("click", exportBalancesCsv);
}

async function loadBalances() {
  const tbody = $("#balancesBody");
  const empty = $("#balancesEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);

  try {
    const m = ($("#balancesMonth")?.value || state.month || "").trim();
    const data = await apiGet("/dashboard/balances", { month: m });
    const rows = data.rows || data || [];

    let due = 0, rec = 0, arr = 0;

    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const tenant = r.tenant_name || r.tenant || r.full_name || "—";
      const billed = Number(r.rent_billed_month ?? r.billed ?? r.total_due ?? 0);
      const received = Number(r.rent_received_month ?? r.received ?? r.paid_total ?? 0);
      const arrears = Number(r.arrears_end ?? r.arrears ?? r.invoice_balance ?? 0);
      const rate = r.rent_collection_rate ?? r.collection_rate ?? (billed > 0 ? received / billed : 0);

      due += billed; rec += received; arr += arrears;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${clampStr(tenant, 55)}</td>
        <td class="num">${fmtKES2(billed)}</td>
        <td class="num">${fmtKES2(received)}</td>
        <td class="num">${fmtKES2(arrears)}</td>
        <td class="num">${fmtPct(rate)}</td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    setText("#balMonthDue", `${fmtKES(due)} billed`);
    setText("#balMonthCollected", `${fmtKES(rec)} received`);
    setText("#balMonthBalance", `${fmtKES(arr)} arrears (end)`);
    setText("#balMonthRate", `${fmtPct(due > 0 ? rec / due : 0)} rent collection rate`);
    setText("#balancesLastUpdated", `Last updated: ${new Date().toLocaleString()}`);

    if (!rows.length) show(empty, true);

    // Keep the "Outstanding by tenant" section aligned (loads only if balances tab visible)
    if (state.activeTab === "balances") loadOutstandingByTenant().catch(() => {});
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load balances: ${e.message}`);
  }
}

async function loadOutstandingByTenant() {
  const tbody = $("#outstandingBody");
  const empty = $("#outstandingEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);

  try {
    const m = state.month;
    const data = await apiGet("/dashboard/outstanding_by_tenant", { month: m });
    const rows = data.rows || data || [];

    const frag = document.createDocumentFragment();
    rows.forEach(r => {
      const tenant = r.tenant_name || r.tenant || r.full_name || "—";
      const overdue = Number(r.overdue ?? r.invoice_balance ?? r.balance ?? 0);
      const rate = r.rent_collection_rate ?? r.collection_rate ?? 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${clampStr(tenant, 55)}</td>
        <td class="num">${fmtKES2(overdue)}</td>
        <td class="num">${fmtPct(rate)}</td>
      `;
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
    setText("#outstandingLastUpdated", `Last updated: ${new Date().toLocaleString()}`);
    if (!rows.length) show(empty, true);
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load outstanding by tenant: ${e.message}`);
  }
}

function exportBalancesCsv() {
  const rows = [];
  const headers = ["Tenant", "Rent billed (month)", "Rent received (month)", "Arrears (end)", "Rent collection rate"];
  rows.push(headers);
  $$("#balancesBody tr").forEach(tr => {
    const cols = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim());
    if (cols.length) rows.push(cols);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `balances_${state.month || "month"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ------------------------- Dunning ------------------------- */
function initDunning() {
  $("#reloadDunning")?.addEventListener("click", () => loadDunning(true));
  $("#dunningSelectAll")?.addEventListener("change", (e) => {
    const yes = !!e.target.checked;
    $$("#dunningBody input[type=checkbox][data-dun]").forEach(cb => cb.checked = yes);
  });

  $("#btnDunningBuildLinks")?.addEventListener("click", () => buildDunningLinks());
  $("#btnDunningMarkSent")?.addEventListener("click", () => markDunningSelectedAsSent());
}

function getSelectedDunningRows() {
  return $$("#dunningBody input[type=checkbox][data-dun]:checked").map(cb => {
    try { return JSON.parse(cb.dataset.dun); } catch { return null; }
  }).filter(Boolean);
}

function defaultDunningText({ tenant, period, overdue }) {
  const amt = fmtKES2(overdue || 0);
  const who = tenant ? `Hi ${tenant}, ` : "Hi, ";
  return `${who}friendly reminder your rent for ${period} is overdue by ${amt}. Kindly settle at your earliest convenience. Thank you.`;
}

function buildDunningLinks({ autoOpen = false } = {}) {
  const msg = $("#dunningMsg");
  const links = $("#dunningLinks");
  const linksBody = $("#dunningLinksBody");
  if (!linksBody || !links || !msg) return;

  const selected = getSelectedDunningRows();
  if (!selected.length) {
    msg.textContent = "Select at least one tenant first.";
    show(links, false);
    return;
  }

  msg.textContent = `Building ${selected.length} WhatsApp link(s)…`;
  linksBody.innerHTML = "";

  const frag = document.createDocumentFragment();
  selected.forEach((r, idx) => {
    const tenant = r.tenant_name || r.tenant || "Tenant";
    const phone = r.phone || r.tenant_phone || "";
    const overdue = Number(r.overdue ?? r.invoice_balance ?? r.balance ?? 0);
    const period = monthLabel(state.month);
    const text = defaultDunningText({ tenant, period, overdue });
    const url = buildWhatsAppUrl({ phone, text });

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = `${idx + 1}. ${tenant} — ${fmtKES2(overdue)}`;
    frag.appendChild(a);

    if (autoOpen) window.open(url, "_blank");
  });

  linksBody.appendChild(frag);
  show(links, true);
  msg.textContent = "Links ready. Click each link to open WhatsApp.";
}

async function markDunningSelectedAsSent() {
  const msg = $("#dunningMsg");
  if (!msg) return;

  const selected = getSelectedDunningRows();
  if (!selected.length) {
    msg.textContent = "Select at least one tenant first.";
    return;
  }

  // We attempt a safe, generic payload that your backend can accept.
  // If your backend endpoint name differs, adjust here only.
  const invoiceIds = selected.map(r => r.invoice_id || r.invoice || r.invoiceId).filter(Boolean);

  msg.textContent = "Marking selected as sent…";
  try {
    await apiPost("/admin/dunning/mark_sent", { month: state.month, invoice_ids: invoiceIds }, { admin: true });
    msg.textContent = `Marked ${invoiceIds.length} as sent.`;
    loadDunning(true);
  } catch (e) {
    console.error(e);
    msg.textContent = `Failed to mark as sent: ${e.message}`;
  }
}

async function loadDunning() {
  updateMonthLabelsEverywhere();

  const tbody = $("#dunningBody");
  const empty = $("#dunningEmpty");
  const last = $("#dunningLastUpdated");
  const selectAll = $("#dunningSelectAll");
  if (!tbody) return;

  tbody.innerHTML = "";
  show(empty, false);
  if (selectAll) selectAll.checked = false;
  show($("#dunningLinks"), false);
  setText("#dunningMsg", "");

  try {
    // Prefer a dedicated dunning endpoint if available, else fall back to outstanding_by_tenant.
    let data;
    try {
      data = await apiGet("/dashboard/dunning", { month: state.month });
    } catch {
      data = await apiGet("/dashboard/outstanding_by_tenant", { month: state.month });
    }

    const rows = data.rows || data || [];
    const items = rows
      .map(r => ({
        tenant_name: r.tenant_name || r.tenant || r.full_name || "—",
        overdue: Number(r.overdue ?? r.invoice_balance ?? r.balance ?? 0),
        rent_collection_rate: r.rent_collection_rate ?? r.collection_rate ?? 0,
        tenant_phone: r.tenant_phone || r.phone || "",
        invoice_id: r.invoice_id || r.invoice || "",
        whatsapp_url: r.whatsapp_url || r.whatsapp || "",
      }))
      .filter(x => x.overdue > 0);

    const frag = document.createDocumentFragment();
    items.forEach(it => {
      const tr = document.createElement("tr");

      const payload = {
        tenant_name: it.tenant_name,
        overdue: it.overdue,
        rent_collection_rate: it.rent_collection_rate,
        tenant_phone: it.tenant_phone,
        invoice_id: it.invoice_id,
      };

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.dun = JSON.stringify(payload);

      const td0 = document.createElement("td");
      td0.appendChild(cb);

      const td1 = document.createElement("td");
      td1.textContent = it.tenant_name;

      const td2 = document.createElement("td");
      td2.className = "num";
      td2.textContent = fmtKES2(it.overdue);

      const td3 = document.createElement("td");
      td3.className = "num";
      td3.textContent = fmtPct(it.rent_collection_rate);

      const td4 = document.createElement("td");
      const waText = defaultDunningText({ tenant: it.tenant_name, period: monthLabel(state.month), overdue: it.overdue });
      const waUrl = it.whatsapp_url || buildWhatsAppUrl({ phone: it.tenant_phone, text: waText });
      td4.innerHTML = `<a href="${waUrl}" target="_blank" rel="noopener">WhatsApp</a>`;

      const td5 = document.createElement("td");
      td5.textContent = it.invoice_id ? String(it.invoice_id).slice(0, 8) + "…" : "—";
      td5.title = it.invoice_id || "";

      tr.appendChild(td0);
      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      tr.appendChild(td4);
      tr.appendChild(td5);

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);

    setText("#dunningMonthLabel", monthLabel(state.month));
    if (last) last.textContent = `Last updated: ${new Date().toLocaleString()}`;

    if (!items.length) show(empty, true);
  } catch (e) {
    console.error(e);
    show(empty, true);
    setText(empty, `Failed to load dunning: ${e.message}`);
  }
}

/* ------------------------- WhatsApp Builder ------------------------- */
function initWhatsAppBuilder() {
  $("#waBuild")?.addEventListener("click", () => {
    const tenant = ($("#waTenant")?.value || "").trim();
    const phone = ($("#waPhone")?.value || "").trim();
    const period = ($("#waPeriod")?.value || "").trim() || monthLabel(state.month);
    const bal = Number($("#waBalance")?.value || 0);

    const text = defaultDunningText({ tenant, period, overdue: bal });
    const url = buildWhatsAppUrl({ phone, text });

    const out = $("#waResult");
    if (out) out.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Open WhatsApp message</a>`;
  });
}

/* ------------------------- Settings ------------------------- */
function initSettings() {
  $("#saveSettings")?.addEventListener("click", () => {
    const api = ($("#apiBase2")?.value || "").trim().replace(/\/+$/, "");
    const tok = ($("#adminToken")?.value || "").trim();
    if (api) {
      state.apiBase = api;
      localStorage.setItem("api_base", api);
      const top = $("#apiBase");
      if (top) top.value = api;
    }
    if (tok) localStorage.setItem("admin_token", tok);
    alert("Saved.");
  });

  $("#resetSettings")?.addEventListener("click", () => {
    localStorage.removeItem("api_base");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("month");
    localStorage.removeItem("active_tab");
    location.reload();
  });

  // prefill
  if ($("#apiBase2")) $("#apiBase2").value = state.apiBase || "";
  if ($("#adminToken")) $("#adminToken").value = localStorage.getItem("admin_token") || "";
}

/* ------------------------- Admin Invoice Actions ------------------------- */
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
        const t = localStorage.getItem("admin_token") || (window.getAdminToken ? window.getAdminToken() : "");
        if (t) headers["X-Admin-Token"] = t;

        const base = (state.apiBase || "").replace(/\/+$/, "");
        const res = await fetch(base + "/admin/ping", { headers });
        const data = await res.json().catch(() => ({}));
        setMsg(res.ok ? `OK: ${JSON.stringify(data)}` : `Failed: ${JSON.stringify(data)}`);
      } catch (e) {
        setMsg("Auth ping failed: " + e.message);
      }
    });
  }

  if (markBtn) {
    markBtn.addEventListener("click", async () => {
      const invoiceId = (input?.value || "").trim();
      if (!invoiceId) return setMsg("Paste an invoice_id first.");
      setMsg("Marking invoice as sent…");
      try {
        // If your backend uses a different endpoint name, adjust this path:
        await apiPost("/admin/invoices/mark_sent", { invoice_id: invoiceId }, { admin: true });
        setMsg("Marked as sent.");
      } catch (e) {
        setMsg("Failed: " + e.message);
      }
    });
  }
}

/* ------------------------- Rendering helpers ------------------------- */
function renderStatus(status) {
  const s = (status || "").toString().toLowerCase();
  if (s === "due" || s === "overdue" || s === "unpaid") return `<span class="status due">due</span>`;
  if (s === "ended" || s === "inactive") return `<span class="status ended">ended</span>`;
  return `<span class="status ok">ok</span>`;
}

function renderWhatsAppLink({ tenant, phone, period, balance }) {
  const text = defaultDunningText({ tenant, period, overdue: balance });
  const url = buildWhatsAppUrl({ phone, text });
  return `<a href="${url}" target="_blank" rel="noopener">WhatsApp</a>`;
}
