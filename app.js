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
    if (initial && monthSelect) {
      const raw = await apiGet("/months");
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      const months = rows.map(r => (typeof r === "string" ? r : r?.ym)).filter(Boolean);

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

        $("#rentrollCountChip") && ($("#rentrollCountChip").textContent = "0");
    $("#rentrollDueChip")   && ($("#rentrollDueChip").textContent   = "KES 0 due");
    $("#rentrollPaidChip")  && ($("#rentrollPaidChip").textContent  = "KES 0 paid");
    $("#rentrollBalChip")   && ($("#rentrollBalChip").textContent   = "KES 0 balance");


    // ✅ PASTE START: Rent Roll totals (for the currently displayed/filtered rows)
    const rrCountEl = $("#rentrollCountChip");
    const rrDueEl   = $("#rentrollDueChip");
    const rrPaidEl  = $("#rentrollPaidChip");
    const rrBalEl   = $("#rentrollBalChip");

    const toNum = (v) => {
      if (v === null || v === undefined) return 0;
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    const rrCount = filtered.length;

    // due = rent + late_fees (credits not shown in table, so we keep it simple)
    const rrDue = filtered.reduce((s, r) =>
      s + toNum(r.subtotal_rent) + toNum(r.late_fees), 0);

    const rrBal = filtered.reduce((s, r) => s + toNum(r.balance), 0);

    // paid = due - balance (clamped at >=0)
    const rrPaid = Math.max(0, rrDue - rrBal);

    if (rrCountEl) rrCountEl.textContent = String(rrCount);
    if (rrDueEl)   rrDueEl.textContent   = `KES ${fmtKes(rrDue)} due`;
    if (rrPaidEl)  rrPaidEl.textContent  = `KES ${fmtKes(rrPaid)} paid`;
    if (rrBalEl)   rrBalEl.textContent   = `KES ${fmtKes(rrBal)} balance`;
    // ✅ PASTE END

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

async function loadBalances(initial = false) {
  const monthSelect = $("#balancesMonth"); // must match your HTML ID
  const empty = $("#balancesEmpty");
  empty && empty.classList.add("hidden");

  // Optional UI elements if you have them
  const labelEl = $("#balancesMonthLabel");
  const dueEl   = $("#balancesTotalDue");
  const paidEl  = $("#balancesTotalPaid");
  const balEl   = $("#balancesTotalBalance");

  // Outstanding-by-tenant table body (support common IDs)
  const outBody =
    $("#outstandingByTenantBody") ||
    $("#balancesOutstandingBody") ||
    $("#outstandingBody");

  try {
    if (initial && monthSelect) {
      const raw = await apiGet("/months");
      const rows = Array.isArray(raw) ? raw : (raw?.data || []);
      let months = rows.map(r => (typeof r === "string" ? r : r?.ym)).filter(Boolean);
      months = Array.from(new Set(months)).sort((a, b) => b.localeCompare(a));

      if (state.currentMonth && !months.includes(state.currentMonth)) months.unshift(state.currentMonth);
      if (!months.length && state.currentMonth) months.push(state.currentMonth);

      monthSelect.innerHTML = "";
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

    // Use fallbacks (your backend may use dashboard/overview etc.)
    const [overview, outstanding] = await Promise.all([
      apiGetFirst([
        `/dashboard/overview?month=${encodeURIComponent(month)}`,
        `/overview?month=${encodeURIComponent(month)}`
      ]),
      apiGetFirst([
        `/balances/outstanding?month=${encodeURIComponent(month)}`,
        `/balances/outstanding_by_tenant?month=${encodeURIComponent(month)}`
      ]).catch(() => ({ data: [] })) // allow balances page even if endpoint missing
    ]);

    const ov = overview?.data ?? overview ?? {};
    const outRows = outstanding?.data ?? outstanding?.rows ?? outstanding ?? [];

    // Optional summary
    if (labelEl) labelEl.textContent = formatMonthLabel(month);
    const totalDue  = ov.total_due ?? ov.rent_due_total ?? 0;
    const totalPaid = ov.total_paid ?? ov.amount_paid_total ?? 0;
    const balance   = ov.balance_total ?? ov.total_outstanding ?? (totalDue - totalPaid);

    if (dueEl)  dueEl.textContent  = fmtKes(totalDue);
    if (paidEl) paidEl.textContent = fmtKes(totalPaid);
    if (balEl)  balEl.textContent  = fmtKes(balance);

    // Render outstanding-by-tenant if table exists
    if (outBody) {
      outBody.innerHTML = "";
      for (const r of (outRows || [])) {
        const tr = document.createElement("tr");
        const tenant = r.tenant ?? r.tenant_name ?? r.payer_name ?? "";
        const unit   = r.unit_code ?? r.unit ?? "";
        const due    = Number(r.total_due ?? r.due_total ?? r.rent_due ?? 0);
        const paid   = Number(r.paid_total ?? r.total_paid ?? r.amount_paid ?? 0);
        const bal    = Number(r.balance ?? (due - paid));
        tr.innerHTML = `
          <td>${tenant}</td>
          <td>${unit}</td>
          <td class="text-right">${fmtKes(due)}</td>
          <td class="text-right">${fmtKes(paid)}</td>
          <td class="text-right font-semibold">${fmtKes(bal)}</td>
        `;
        outBody.appendChild(tr);
      }
    }
  } catch (err) {
    console.error("loadBalances error:", err);
    if (empty) {
      empty.textContent = "Error loading balances.";
      empty.classList.remove("hidden");
    }
  }
}

// -------- per-unit balances ("By Unit") --------
async function loadBalancesByUnit() {
  const body = $("#balancesByUnitBody");
  const empty = $("#balancesByUnitEmpty");
  if (!body) return;

  body.innerHTML = "";
  empty && empty.classList.add("hidden");

  // IMPORTANT: use balancesMonth if present, otherwise global month
  const ym = ($("#balancesMonth")?.value || state.currentMonth);

  try {
    const resp = await apiGetFirst([
      `/balances/by_unit?month=${encodeURIComponent(ym)}`,
      `/balances/by-unit?month=${encodeURIComponent(ym)}`
    ]);

    const rows = resp?.data ?? resp?.rows ?? resp ?? [];

    if (!rows.length) {
      empty && empty.classList.remove("hidden");
      return;
    }

    for (const r of rows) {
      const balance = Number(r.balance ?? ((r.total_due || 0) - (r.paid_total || 0)));

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.unit_code || ""}</td>
        <td>${r.month_start || ""}</td>
        <td>${r.month_end || ""}</td>
        <td class="text-right">${fmtKes(r.subtotal_rent || 0)}</td>
        <td class="text-right">${fmtKes(r.late_fees || 0)}</td>
        <td class="text-right">${fmtKes(r.credits || 0)}</td>
        <td class="text-right">${fmtKes(r.total_due || 0)}</td>
        <td class="text-right">${fmtKes(r.paid_total || 0)}</td>
        <td class="text-right font-semibold">${fmtKes(balance)}</td>
      `;
      body.appendChild(tr);
    }
  } catch (err) {
    console.error("loadBalancesByUnit error:", err);
    body.innerHTML = `<tr><td colspan="9">Error loading balances by unit.</td></tr>`;
    empty && empty.classList.remove("hidden");
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

    const ym = state.currentMonth;
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

/* -------- month picker global -------- */
function initMonthPicker() {
  const mp = $("#monthPicker");
  const nowYm = yyyymm();
  setCurrentMonth(nowYm, { triggerReload: false });

  if (mp) {
    mp.value = nowYm;
    mp.addEventListener("change", () => {
      const v = mp.value || nowYm;
      setCurrentMonth(v, { triggerReload: true });
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
  loadBalances(true);
  loadBalancesByUnit();

  // Reload buttons
  $("#reloadLeases")?.addEventListener("click", loadLeases);
  $("#reloadBalances")?.addEventListener("click", () => {
    loadBalances();
    loadBalancesByUnit();
  });
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
