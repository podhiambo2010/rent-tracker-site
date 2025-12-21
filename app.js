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

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return "0.0%";
  return `${Number(n).toFixed(1)}%`;
}

function setText(sel, text) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (el) el.textContent = text;
}

function sum(rows, pick) {
  return (rows || []).reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);
}

/* -------- HTML escape (you were calling escapeHtml but it was not defined) -------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------- balances (source = ledger: /balances/by_unit) -------- */
async function loadBalances(initial = false) {
  const body = $("#balancesBody");
  const empty = $("#balancesEmpty");

  // DEBUG marker to prove THIS function is the one being executed
  console.warn("[BALDBG] loadBalances() entered. initial =", initial);

  if (!body) {
    console.warn("[BALDBG] #balancesBody not found. Balances tab DOM may not be mounted yet.");
    return;
  }

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  const ym = ($("#balancesMonth")?.value || state.currentMonth || yyyymm());
  console.warn("[BALDBG] month resolved to:", ym);
  if (!ym) return;

  // labels
  const monthLabel = formatMonthLabel(ym);
  $("#balMonthLabel") && ($("#balMonthLabel").textContent = monthLabel);
  $("#outstandingMonthLabel") && ($("#outstandingMonthLabel").textContent = monthLabel);

  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  try {
    // ------------------------------------------------------------
    // 1) Totals chips (prefer balances/overview; fallback dashboard/overview)
    // ------------------------------------------------------------
    let dash = null;
    try {
      dash = await apiGet(`/balances/overview?month=${encodeURIComponent(ym)}`);
      console.warn("[BALDBG] /balances/overview response:", dash);
    } catch (e) {
      console.warn("[BALDBG] /balances/overview failed, falling back to /dashboard/overview", e);
      dash = await apiGet(`/dashboard/overview?month=${encodeURIComponent(ym)}`);
      console.warn("[BALDBG] /dashboard/overview response:", dash);
    }

    const dueTotal  = toNum(dash?.total_due ?? dash?.rent_subtotal_total ?? 0);
    const paidTotal = toNum(dash?.total_paid ?? 0);
    const balTotal  = toNum(dash?.balance_total ?? 0);

    const creditTotal = balTotal < 0 ? -balTotal : 0;
    const outstandingTotal = balTotal > 0 ? balTotal : 0;

    const ratePct =
      toNum(dash?.collection_rate_pct ?? (dueTotal > 0 ? (paidTotal / dueTotal) * 100 : 0));

    $("#balMonthDue") && ($("#balMonthDue").textContent = `${fmtKes(dueTotal)} due`);
    $("#balMonthCollected") && ($("#balMonthCollected").textContent = `${fmtKes(paidTotal)} collected`);

    const balChip = $("#balMonthBalance");
    if (balChip) {
      balChip.textContent =
        creditTotal > 0 ? `${fmtKes(creditTotal)} credit` : `${fmtKes(outstandingTotal)} balance`;
    }

    $("#balMonthRate") && ($("#balMonthRate").textContent = `${fmtPct(ratePct)} collection rate`);
    $("#balancesLastUpdated") && ($("#balancesLastUpdated").textContent = `Last updated: ${new Date().toLocaleString()}`);

    // ------------------------------------------------------------
    // 2) Table rows (ledger-based): /balances/by_unit
    // ------------------------------------------------------------
    console.warn("[BALDBG] Fetching /balances/by_unit …");
    const resp = await apiGet(`/balances/by_unit?month=${encodeURIComponent(ym)}`);

    // IMPORTANT: if the API returns literal JSON null, resp will be null here.
    console.warn("[BALDBG] /balances/by_unit raw response:", resp);

    const rows = resp?.data ?? (Array.isArray(resp) ? resp : []);
    console.warn(
      "[BALDBG] rows isArray:", Array.isArray(rows),
      "rows.length:", Array.isArray(rows) ? rows.length : "(n/a)",
      "sample row:", Array.isArray(rows) ? rows[0] : rows
    );

    // Keep for manual inspection in console
    window.__balancesByUnitResp = resp;
    window.__balancesByUnitRows = rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn("[BALDBG] rows empty OR API returned null -> showing empty state");
      empty && empty.classList.remove("hidden");
      return;
    }

    // group by tenant
    const byTenant = new Map();

    for (const r of rows) {
      const tenant = (r.tenant || r.tenant_name || "—").trim();

      // Expecting ledger fields: rent_due, paid, balance
      const due = toNum(r.rent_due ?? r.total_due ?? 0);
      const bal = toNum(r.balance ?? 0);

      // Recompute "paid toward this month" safely to prevent >100% monthly collection
      // If credit (negative balance), treat month as fully paid, and show extra as credit via balanceDisplay
      const paid = bal < 0 ? due : Math.max(0, due - bal);

      const credit = bal < 0 ? -bal : 0;
      const outstanding = bal > 0 ? bal : 0;

      const prev = byTenant.get(tenant) || { due: 0, paid: 0, balance: 0, credit: 0 };
      prev.due += due;
      prev.paid += paid;
      prev.balance += outstanding;
      prev.credit += credit;
      byTenant.set(tenant, prev);
    }

    // render
    const list = Array.from(byTenant.entries())
      .map(([tenant, v]) => ({
        tenant,
        due: v.due,
        paid: v.paid,
        balance: v.balance, // outstanding only
        credit: v.credit,
        rate: v.due > 0 ? Math.min(100, (v.paid / v.due) * 100) : 0, // cap at 100
      }))
      .sort((a, b) => (b.balance - a.balance)); // biggest outstanding first

    for (const r of list) {
      const tr = document.createElement("tr");

      // show credit as negative balance visually
      const balanceDisplay = r.credit > 0 ? `-${fmtKes(r.credit)}` : fmtKes(r.balance);

      tr.innerHTML = `
        <td>${escapeHtml(r.tenant)}</td>
        <td class="num">${fmtKes(r.due)}</td>
        <td class="num">${fmtKes(r.paid)}</td>
        <td class="num">${balanceDisplay}</td>
        <td class="num">${fmtPct(r.rate)}</td>
      `;
      body.appendChild(tr);
    }

    // ------------------------------------------------------------
    // 3) Outstanding-by-tenant section (same computed list)
    // ------------------------------------------------------------
    const oBody = $("#outstandingBody");
    const oEmpty = $("#outstandingEmpty");
    if (oBody) {
      oBody.innerHTML = "";
      oEmpty && oEmpty.classList.add("hidden");

      const outstandingRows = list.filter(x => x.balance > 0);
      if (!outstandingRows.length) {
        oEmpty && oEmpty.classList.remove("hidden");
      } else {
        for (const r of outstandingRows) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(r.tenant)}</td>
            <td style="text-align:right">${fmtKes(r.balance)}</td>
            <td style="text-align:right">${fmtPct(r.rate)}</td>
          `;
          oBody.appendChild(tr);
        }
      }

      $("#outstandingLastUpdated") && ($("#outstandingLastUpdated").textContent = `Last updated: ${new Date().toLocaleString()}`);
    }

    console.warn("[BALDBG] loadBalances() completed OK.");
  } catch (err) {
    console.error("[BALDBG] loadBalances error:", err);
    empty && empty.classList.remove("hidden");
  }
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
  if (typeof loadBalances === "function") loadBalances();
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

    // KPIs
    if (kpiLeases) kpiLeases.textContent = leases.length ?? 0;

    const openCount = rentRoll.filter((r) => (r.status || "").toLowerCase() !== "paid").length;
    if (kpiOpen) kpiOpen.textContent = openCount;

    const paymentsTotal = (payments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    if (kpiPayments) kpiPayments.textContent = fmtKes(paymentsTotal);

    if (kpiBalance) kpiBalance.textContent = fmtKes(dash.balance_total ?? dash.total_outstanding ?? 0);

    // Monthly collection summary
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
          <button class="btn ghost btn-wa-lease" data-lease-id="${r.lease_id}">
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

  // ✅ Totals chips (optional in HTML)
  const countChip = $("#paymentsCountChip");
  const totalChip = $("#paymentsTotalChip");

  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  // ✅ Reset totals immediately (prevents stale totals on reload)
  if (countChip) countChip.textContent = "0";
  if (totalChip) totalChip.textContent = fmtKes(0);

  try {
    if (initial && monthSelect) {
      const raw = await apiGetFirst(["/payments/months", "/months"]);
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      let months = rows
  .map(r => (typeof r === "string" ? r : (r?.ym || r?.month)))
  .filter(Boolean);

// dedupe + newest first
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

    // ✅ Compute totals from filtered list
    const totalPaid = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (countChip) countChip.textContent = String(filtered.length);
    if (totalChip) totalChip.textContent = fmtKes(totalPaid);

    // ✅ Show “no data” but keep totals visible (0 / KES 0)
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
    // ✅ IMPORTANT: if month dropdown is empty, treat as initial load
    const needMonths = !!monthSelect && monthSelect.options.length === 0;
    if ((initial || needMonths) && monthSelect) {
      const raw = await apiGet("/months");
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      const months = rows.map(r => (typeof r === "string" ? r : r?.ym)).filter(Boolean);

      monthSelect.innerHTML = "";

      if (state.currentMonth && !months.includes(state.currentMonth)) months.unshift(state.currentMonth);
      if (!months.length && state.currentMonth) months.push(state.currentMonth);
      if (!months.length) months.push(yyyymm()); // final fallback

      for (const ym of months) {
        const opt = document.createElement("option");
        opt.value = ym;
        opt.textContent = formatMonthLabel(ym);
        monthSelect.appendChild(opt);
      }

      monthSelect.value = state.currentMonth || months[0] || yyyymm();
      wireMonthSelect(monthSelect);
    }

    // ✅ ALWAYS have a usable month (never blank/undefined)
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

    // ✅ Rent Roll totals chips (support multiple possible HTML IDs)
    const rrCountEl =
      $("#rentrollCountChip") || $("#rentrollCount") || $("#rentRollCount") || $("#rrCountChip");

    const rrDueEl =
      $("#rentrollDueChip") || $("#rentrollDue") || $("#rentRollDue") || $("#rrDueChip");

    const rrPaidEl =
      $("#rentrollPaidChip") || $("#rentrollPaid") || $("#rentRollPaid") || $("#rrPaidChip");

    const rrBalEl =
      $("#rentrollBalChip") || $("#rentrollBalance") || $("#rentRollBalance") || $("#rrBalChip");

    // ✅ NEW: Credit chip
    const rrCreditEl =
      $("#rentrollCreditChip") || $("#rentrollCredit") || $("#rentRollCredit") || $("#rrCreditChip");

    const toNum = (v) => {
      if (v === null || v === undefined) return 0;
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    // returns "540,469" (NO "KES"), even if fmtKes() includes "KES"
    const fmtNumOnly = (n) => {
      const s = (typeof fmtKes === "function")
        ? String(fmtKes(n))
        : String(Number(toNum(n)).toLocaleString());
      return s.replace(/^KES\s*/i, "").trim();
    };

    const rrCount = filtered.length;

    let due = 0;
    let paid = 0;
    let outstanding = 0; // balances > 0
    let credit = 0;      // balances < 0 turned positive

    for (const r of filtered) {
      const subtotal = toNum(r.subtotal_rent);
      const late = toNum(r.late_fees);

      const creditsField =
        (r.credits !== undefined && r.credits !== null) ? toNum(r.credits) : 0;

      const rowDueRaw =
        (r.total_due !== undefined && r.total_due !== null)
          ? toNum(r.total_due)
          : (subtotal + late - creditsField);

      const rowDue = Math.max(0, rowDueRaw);
      const b = toNum(r.balance);

      due += rowDue;

      if (b >= 0) {
        outstanding += b;
        paid += Math.max(0, rowDue - b);
      } else {
        // negative balance = credit
        paid += rowDue;
        credit += (-b);
      }
    }

    if (rrCountEl) rrCountEl.textContent = String(rrCount);
    if (rrDueEl) rrDueEl.textContent = `KES ${fmtNumOnly(due)} due`;
    if (rrPaidEl) rrPaidEl.textContent = `KES ${fmtNumOnly(paid)} paid`;

    // ✅ Balance chip ALWAYS shows balance
    if (rrBalEl) rrBalEl.textContent = `KES ${fmtNumOnly(outstanding)} balance`;

    // ✅ Credit chip ALWAYS shows credit
    if (rrCreditEl) rrCreditEl.textContent = `KES ${fmtNumOnly(credit)} credit`;

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
          <button class="btn ghost btn-wa-lease" data-lease-id="${r.lease_id}">
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

  if (healthBtn) {
    healthBtn.addEventListener("click", async () => {
      msg.textContent = "Checking admin token…";
      try {
        const headers = {};
        const t = getAdminTokenFromStorage();
        if (t) headers["X-Admin-Token"] = t;
        const res = await fetch(state.apiBase.replace(/\/+$/, "") + "/admin/ping", { headers });
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
      const id = (input?.value || "").trim();
      if (!id) {
        msg.textContent = "Enter invoice_id (UUID) first.";
        return;
      }
      msg.textContent = "Marking invoice as sent…";

      try {
        const data = await apiPost(
          "/invoices/mark_sent",
          { invoice_ids: [id], sent_via: "whatsapp", sent_to: "tenant" },
          { admin: true }
        );
        msg.textContent = `Marked sent: ${(data.updated || []).join(", ")}`;
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

    const ym = state.currentMonth || yyyymm();
    const url = state.apiBase.replace(/\/+$/, "") + `${endpoint}?month=${encodeURIComponent(ym)}`;

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
    const btn = ev.target.closest(".btn-wa-lease");
    if (!btn) return;

    const leaseId = btn.dataset.leaseId;
    if (!leaseId) return;

    const month = state.currentMonth; // ✅ critical fix
    const url =
      state.apiBase.replace(/\/+$/, "") +
      `/wa_for_lease_redirect?lease_id=${encodeURIComponent(leaseId)}&month=${encodeURIComponent(month)}`;

    window.open(url, "_blank", "noopener");
  });
}

/* --------------------------------------------------------------------------
 * Month picker (global) — MUST set state.currentMonth
 * -------------------------------------------------------------------------- */
async function initMonthPicker() {
  const raw = await apiGet("/months");
  const months = Array.isArray(raw) ? raw : (raw?.data || []);
  // months: ["2025-12","2025-11",...]

  function fillSelect(selectId, values) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    for (const ym of values) {
      const opt = document.createElement("option");
      opt.value = ym;
      opt.textContent = formatMonthLabel(ym); // nicer than raw "YYYY-MM"
      sel.appendChild(opt);
    }
  }

  // ✅ IMPORTANT: use the IDs that exist in your HTML/app.js
  fillSelect("paymentsMonth", months);
  fillSelect("rentrollMonth", months);
  fillSelect("balancesMonth", months);

  const defaultMonth = months?.[0] || yyyymm();

  // set dropdown values
  ["paymentsMonth", "rentrollMonth", "balancesMonth"].forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = defaultMonth;
  });

  // ✅ THIS IS THE REAL “STEP 2”
  // Ensure global month is set once, before any loaders run
  setCurrentMonth(defaultMonth, { triggerReload: false });

  // wire change listeners once
  wireMonthSelect(document.getElementById("paymentsMonth"));
  wireMonthSelect(document.getElementById("rentrollMonth"));
  wireMonthSelect(document.getElementById("balancesMonth"));
}

/* --------------------------------------------------------------------------
 * Per-unit balances ("By Unit")
 * -------------------------------------------------------------------------- */
async function loadBalancesByUnit() {
  const body = $("#balancesByUnitBody");
  const empty = $("#balancesByUnitEmpty");

  // If the HTML doesn't have this section yet, exit quietly.
  if (!body) return;

  body.innerHTML = "";
  if (empty) empty.classList.add("hidden");

  // Use balancesMonth if present, otherwise current global month
  const ym = $("#balancesMonth")?.value || state.currentMonth || yyyymm();

  const toNum = (v) => {
    if (v === null || v === undefined) return 0;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  try {
    // Try multiple endpoints (backwards/forwards compatible)
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
        (toNum(due) > 0 ? toNum(paid) / toNum(due) : 0);

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

/* -------- balances (Overview / By Tenant + Outstanding-by-tenant) -------- */
async function loadBalances(initial = false) {
  const body = $("#balancesBody");
  const empty = $("#balancesEmpty");
  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  // month comes from balancesMonth dropdown if present, else global month
  const ym = ($("#balancesMonth")?.value || state.currentMonth || yyyymm());
  if (!ym) return;

  // keep global state aligned (but don't trigger full reload loop)
  if (ym !== state.currentMonth) setCurrentMonth(ym, { triggerReload: false });

  // labels (if present)
  const monthLabel = formatMonthLabel(ym);
  $("#balMonthLabel") && ($("#balMonthLabel").textContent = monthLabel);
  $("#outstandingMonthLabel") && ($("#outstandingMonthLabel").textContent = monthLabel);

  try {
    // ✅ Source of truth = rent-roll
    const rr = await apiGet(`/rent-roll?month=${encodeURIComponent(ym)}`);
    const rows = rr?.data ?? (Array.isArray(rr) ? rr : []);
    const list = Array.isArray(rows) ? rows : [];

    // totals
    let totalDue = 0;
    let balanceTotal = 0;

    // group by tenant
    const byTenant = new Map();

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    for (const r of list) {
      const tenant = r.tenant || "—";

      // Prefer backend total_due; fallback to subtotal+late-credits
      const due =
        (r.total_due !== undefined && r.total_due !== null)
          ? toNum(r.total_due)
          : (toNum(r.subtotal_rent) + toNum(r.late_fees) - toNum(r.credits));

      const bal = toNum(r.balance);

      totalDue += due;
      balanceTotal += bal;

      const agg = byTenant.get(tenant) || { tenant, due: 0, balance: 0 };
      agg.due += due;
      agg.balance += bal;
      byTenant.set(tenant, agg);
    }

    // paid = due - balance (works even when balance is negative credit)
    const totalPaid = totalDue - balanceTotal;
    const ratePct = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    // Update “This month totals (all tenants)”
    $("#balMonthDue") && ($("#balMonthDue").textContent = `${fmtKes(totalDue)} due`);
    $("#balMonthCollected") && ($("#balMonthCollected").textContent = `${fmtKes(totalPaid)} collected`);

    // show credit nicely if negative
    if ($("#balMonthBalance")) {
      if (balanceTotal < 0) {
        $("#balMonthBalance").textContent = `${fmtKes(-balanceTotal)} credit`;
      } else {
        $("#balMonthBalance").textContent = `${fmtKes(balanceTotal)} balance`;
      }
    }

    $("#balMonthRate") && ($("#balMonthRate").textContent = `${fmtPct(ratePct)} collection rate`);
    $("#balancesLastUpdated") && ($("#balancesLastUpdated").textContent = `Last updated: ${new Date().toLocaleString()}`);

    // Build tenant table rows
    const tenantRows = Array.from(byTenant.values()).map(t => {
      const paid = t.due - t.balance;
      const rp = t.due > 0 ? (paid / t.due) * 100 : 0;
      return { ...t, paid, ratePct: rp };
    });

    // sort by highest outstanding first
    tenantRows.sort((a, b) => (b.balance) - (a.balance));

    if (!tenantRows.length) {
      empty && empty.classList.remove("hidden");
    } else {
      for (const r of tenantRows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.tenant}</td>
          <td class="num">${fmtKes(r.due)}</td>
          <td class="num">${fmtKes(r.paid)}</td>
          <td class="num">${fmtKes(r.balance)}</td>
          <td class="num">${fmtPct(r.ratePct)}</td>
        `;
        body.appendChild(tr);
      }
    }

    // Outstanding by tenant (balance > 0)
    const oBody = $("#outstandingBody");
    const oEmpty = $("#outstandingEmpty");
    if (oBody) {
      oBody.innerHTML = "";
      oEmpty && oEmpty.classList.add("hidden");

      const outstanding = tenantRows
        .filter(x => x.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      if (!outstanding.length) {
        oEmpty && oEmpty.classList.remove("hidden");
      } else {
        for (const r of outstanding) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${r.tenant}</td>
            <td style="text-align:right">${fmtKes(r.balance)}</td>
            <td style="text-align:right">${fmtPct(r.ratePct)}</td>
          `;
          oBody.appendChild(tr);
        }
      }

      $("#outstandingLastUpdated") && ($("#outstandingLastUpdated").textContent = `Last updated: ${new Date().toLocaleString()}`);
    }

  } catch (err) {
    console.error("loadBalances error:", err);
    empty && empty.classList.remove("hidden");

    const defaultMonth = months?.[0] || yyyymm();
    setCurrentMonth(defaultMonth, { triggerReload: false });

  }
}

 /* -------- initial load -------- */
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initApiBaseControls();
  initWhatsAppBuilder();
  initInvoiceActions();
  initExports();
  initRowWhatsAppButtons();

  // 1) wait month picker
  try {
    await initMonthPicker();
  } catch (e) {
    console.error("initMonthPicker failed:", e);
    setCurrentMonth(yyyymm(), { triggerReload: false });
  }

  // 2) now safe to load
  loadOverview();
  loadLeases();
  loadPayments(true);
  loadRentRoll(true);
  loadBalances(true);
  loadBalancesByUnit();

  // Reload buttons (keep yours)
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
