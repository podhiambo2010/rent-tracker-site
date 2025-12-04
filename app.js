/* ==================== Rent Tracker Dashboard — app.js (overview + balances + metrics unified) ==================== */

/* ---------- constants ---------- */
const DEFAULT_API = "https://rent-tracker-api-16i0.onrender.com";

/* ---------- tiny helpers ---------- */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));


// Nicely format KES amounts (works with strings or numbers)
const formatMoney = (value) => {
  if (value === null || value === undefined) return "0.00";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const yyyymm = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const money = (n) =>
  n == null ? "—" : `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;

const ksh = (n) =>
  Number(n || 0).toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  });

/* ---------- app state ---------- */
const state = {
  api: (localStorage.getItem("api_base") || DEFAULT_API).replace(/\/$/, ""),
  adminToken: localStorage.getItem("admin_token") || "",
  leasesView: [],
  paymentsView: [],
  rentrollView: [],
  balancesView: [],
};

/* ---------- generic API helper (uses current base + admin token) ---------- */
async function api(path, options = {}) {
  const base = (state.api || DEFAULT_API).replace(/\/$/, "");
  const url = base + path;

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.adminToken) {
    headers["X-Admin-Token"] = state.adminToken.trim();
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("API error:", data || res.statusText);
    throw new Error((data && data.error) || res.statusText);
  }

  return data;
}

/* ---------- JSON GET/POST helpers (using state.api directly) ---------- */
async function jget(path) {
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function jpost(path, body, { admin = false } = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${state.api}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (admin && state.adminToken) headers["X-Admin-Token"] = state.adminToken;
  const r = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} — ${txt}`);
  }
  return r.json();
}

/* ---------- CSV helpers ---------- */
const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCSV(rows, cols) {
  if (!rows?.length) return "";
  const head = cols.map((c) => csvEscape(c.label)).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) =>
          csvEscape(typeof c.value === "function" ? c.value(r) : r[c.value])
        )
        .join(",")
    )
    .join("\n");
  return head + "\n" + body;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/* ---------- month + messaging helpers ---------- */

// Shared month for Overview + Balances + metrics
function getSelectedMonth() {
  return $("#monthPicker")?.value || new Date().toISOString().slice(0, 7);
}

function fmtMonYearFromISO(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return "";
  try {
    const [y, m] = monthStr.split("-").map(Number);
    if (!y || !m) return "";
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-KE", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return monthStr;
  }
}

function fmtKes(n) {
  const num = Number(n || 0);
  return num.toLocaleString("en-KE", { maximumFractionDigits: 0 });
}

// Normalise API responses that may be either an array or { ok, data: [...] }
function apiArray(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  return [];
}

// General WhatsApp link builder used by:
// - Rent Roll "WhatsApp" buttons
// - Overview "Send All" button
// - DIY WhatsApp tab
function buildWhatsAppURL(phone, ctx = {}) {
  const msisdn = String(phone || "").replace(/[^\d]/g, "");
  if (!msisdn) return "";

  const tenant = ctx.tenant_name || "Tenant";
  const unit   = ctx.unit || "your unit";
  const period = ctx.period || "";

  const rent = Number(
    ctx.rent ?? ctx.subtotal_rent ?? 0
  );
  const late = Number(
    ctx.late_fees ?? ctx.late ?? 0
  );

  // Single source of truth for the monthly invoice total
  const total = Number(
    ctx.total_due ?? (rent + late)
  );

  const paid = Number(ctx.paid_to_date ?? 0);

  // Overall outstanding (for that month or overall, depending on ctx)
  const balance = Number(
    ctx.amount_due ?? ctx.balance ?? (total - paid)
  );

  const dueDate = ctx.due_date || "";

  const lines = [
    `Hello ${tenant},`,
    "",
    `Rent invoice for ${period || "(no period)"} (${unit})`,
    "",
    `Base rent: KES ${fmtKes(rent)}`,
    `Late fees: KES ${fmtKes(late)}`,
    `Total for this month: KES ${fmtKes(total)}`,
  ];

  if (paid) {
    lines.push(`Paid to date: KES ${fmtKes(paid)}`);
  }

  lines.push(`Balance outstanding: KES ${fmtKes(balance)}`);

  if (dueDate) {
    lines.push(`Due date: ${dueDate}`);
  }

  lines.push("", "Kindly clear your balance as soon as possible. Thank you.");

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${msisdn}?text=${text}`;
}

/* ---------- API consumers ---------- */
async function getRentRollForMonth(ym) {
  return jget(`/rent-roll?month=${encodeURIComponent(ym)}&limit=1000`);
}
async function getContactForLease(lease_id) {
  return jget(`/contact_for_lease?lease_id=${encodeURIComponent(lease_id)}`);
}
async function getInvoiceIdForLeaseMonth(lease_id, ym) {
  const res = await fetch(
    `${state.api}/invoices/for_lease_month?lease_id=${encodeURIComponent(
      lease_id
    )}&month=${encodeURIComponent(ym)}`
  );
  if (res.status === 404) return null;
  const json = await res.json();
  return json?.invoice?.id || null;
}

// New helper: get monthly totals from v_balances_monthly
async function fetchBalancesOverview(month) {
  return jget(`/balances/overview?month=${encodeURIComponent(month)}`);
}

// New helper: per-tenant outstanding from v_monthly_outstanding
async function fetchOutstandingRows(month) {
  const ym = month || getSelectedMonth(); // "YYYY-MM"

  const res = await jget(
    `/metrics/monthly-outstanding?month=${encodeURIComponent(ym)}`
  );

  if (!res) return [];

  // API returns { ok: true, data: [...] }
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;

  return [];
}

/* ---------- toast ---------- */
function toast(msg, ms = 2200) {
  const el = $("#actionMsg");
  if (!el) {
    alert(msg);
    return;
  }
  el.textContent = msg;
  el.style.opacity = 1;
  setTimeout(() => {
    el.style.opacity = 0;
  }, ms);
}

/* ==================== OUTSTANDING BY TENANT (TILE) ==================== */

// Renders the little table under "Outstanding by tenant"
function renderOutstanding(rows) {
  const body = document.getElementById("outstandingBody");
  const empty = document.getElementById("outstandingEmpty");
  if (!body) return;

  // Positive balances only, sorted DESC
  const list = (rows || [])
    .filter(
      (r) =>
        Number(
          r.balance_total ?? r.balance ?? r.outstanding ?? r.amount_due ?? 0
        ) > 0
    )
    .sort(
      (a, b) =>
        Number(
          b.balance_total ?? b.balance ?? b.outstanding ?? b.amount_due ?? 0
        ) -
        Number(
          a.balance_total ?? a.balance ?? a.outstanding ?? a.amount_due ?? 0
        )
    );

  body.innerHTML = list
    .map((x) => {
      const name = x.tenant || x.tenant_name || x.tenant_name_text || "—";
      const bal =
        x.balance_total ?? x.balance ?? x.outstanding ?? x.amount_due ?? 0;
      return `
        <tr>
          <td>${name}</td>
          <td style="text-align:right">Ksh ${Number(bal || 0).toLocaleString(
            "en-KE"
          )}</td>
        </tr>`;
    })
    .join("");

  if (empty) empty.classList.toggle("hidden", list.length > 0);
}

/* ---- Balances tab: "Outstanding by tenant (this month)" ---- */
async function loadOutstandingByTenant(month) {
  const ym = month || getSelectedMonth();

  const tbody     = document.getElementById("outstandingBody");
  const empty     = document.getElementById("outstandingEmpty");
  const countEl   = document.getElementById("outstandingCount"); // optional chip
  const updatedEl = document.getElementById("outstandingLastUpdated");

  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="3" class="empty">Loading outstanding balances…</td></tr>';

  try {
    const rows = await fetchOutstandingRows(ym);

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="empty">No outstanding balances this month 🎉</td></tr>';
      if (empty) empty.classList.add("hidden");
      if (countEl) countEl.textContent = "0";
      if (updatedEl) setLastUpdated("outstandingLastUpdated");
      return;
    }

    // Biggest balances first
    rows.sort(
      (a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0)
    );

    const withKesPlain = (v) =>
      `KES ${Number(v || 0).toLocaleString("en-KE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    const html = rows
      .map((r) => {
        const tenant =
          r.tenant ||
          r.tenant_name ||
          r.tenant_name_text ||
          "—";

        const outstanding = Number(
          r.outstanding ??
          r.balance_total ??
          r.balance ??
          r.amount_due ??
          0
        );

        const rate = Number(
          r.collection_rate ??
          r.collection_rate_pct ??
          0
        );

        return `
          <tr>
            <td>${tenant}</td>
            <td class="num">${withKesPlain(outstanding)}</td>
            <td class="num">${rate.toFixed(1)}%</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = html;

    if (empty) empty.classList.toggle("hidden", rows.length > 0);
    if (countEl) countEl.textContent = String(rows.length);
    if (updatedEl) setLastUpdated("outstandingLastUpdated");
  } catch (err) {
    console.error("loadOutstandingByTenant failed", err);
    tbody.innerHTML =
      '<tr><td colspan="3" class="empty">Failed to load outstanding balances.</td></tr>';
  }
}

document.getElementById("reloadOutstanding")?.addEventListener("click", () => {
  loadOutstandingByTenant().catch(console.error);
});

setLastUpdated("outstandingLastUpdated");


/* ============================== DUNNING ============================== */
let _logBusy = false;
async function loadDunningLog(month = "", stage = "") {
  if (_logBusy) return;
  _logBusy = true;
  const qs = [];
  if (month) qs.push(`month=${encodeURIComponent(month)}`);
  if (stage) qs.push(`stage=${encodeURIComponent(stage)}`);
  qs.push("limit=200");
  const url = `${state.api}/reminders/log${
    qs.length ? `?${qs.join("&")}` : ""
  }`;
  let pre = $("#dunningLog");
  if (!pre) {
    const wrap = document.createElement("div");
    wrap.id = "dunningLogWrap";
    wrap.innerHTML = `
      <div class="bar-flex" style="margin:8px 0;">
        <span class="chip">Dunning log</span>
        <button id="logReload" class="btn ghost">Reload</button>
      </div>
      <pre id="dunningLog"></pre>
    `;
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      wrap
    );
    $("#logReload")?.addEventListener("click", () => loadDunningLog());
    pre = $("#dunningLog");
  }
  pre.textContent = "Loading dunning log…";
  try {
    const rows = await jget(url);
    pre.textContent = (rows?.length
      ? rows
          .map((r) => {
            const ts = new Date(r.created_at).toLocaleString("en-KE");
            const inv = String(r.invoice_id || "").slice(0, 8) + "…";
            const lea = String(r.lease_id || "").slice(0, 8) + "…";
            const amt = Number(r.amount || 0).toLocaleString("en-KE");
            return `${ts} • ${r.stage} • KSh ${amt} • inv ${inv} • lease ${lea}`;
          })
          .join("\n")
      : "No dunning log rows.");
    toast("Loaded dunning log");
  } catch (e) {
    pre.textContent = `Failed to load: ${e}`;
    toast("Failed to load dunning log");
  } finally {
    _logBusy = false;
  }
}

async function callDunning(preview) {
  if (!state.adminToken) {
    toast("Set Admin token in Settings first");
    return;
  }
  let pre = $("#dunningOut");
  if (!pre) {
    const box = document.createElement("pre");
    box.id = "dunningOut";
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      box
    );
    pre = box;
  }
  pre.textContent = preview
    ? "Running dunning (preview)..."
    : "Applying dunning...";
  try {
    const url = `${state.api}/cron/dunning?dry_run=${preview ? 1 : 0}`;
    const opt = preview
      ? { method: "GET", headers: { "X-Admin-Token": state.adminToken } }
      : { method: "POST", headers: { "X-Admin-Token": state.adminToken } };
    const r = await fetch(url, opt);
    const data = await r.json();
    const list = (title, arr) =>
      !arr?.length
        ? `\n${title}: 0`
        : `\n${title}: ${arr.length}\n` +
          arr
            .map((x) => {
              const inv = String(x.invoice_id || "").slice(0, 8) + "…";
              const lea = String(x.lease_id || "").slice(0, 8) + "…";
              const bal = Number(x.balance || 0).toLocaleString("en-KE");
              const fee = x.fee
                ? ` | fee ${Number(x.fee).toLocaleString("en-KE")}`
                : "";
              const wa = x.wa ? ` | WA: ${x.wa}` : "";
              return ` • inv ${inv} | lease ${lea} | bal KES ${bal}${fee}${wa}`;
            })
            .join("\n");
    pre.textContent =
      `Dunning ${data.dry_run ? "(dry run)" : "(applied)"}\nDate: ${
        data.today
      }\nLate fee: ${data.late_fee_pct} (min KES ${data.late_fee_min_kes})` +
      list("Day 5 reminders", data.day5) +
      list("Day 10 (late fee stage)", data.day10) +
      list("Overdue (past months)", data.overdue);
    toast(preview ? "Dunning preview ready" : "Dunning applied");
  } catch (e) {
    pre.textContent = `Failed: ${e}`;
    toast("Dunning request failed");
  }
}

/* =============================== TABS =============================== */
function showTab(name) {
  $$(".tab").forEach((a) =>
    a.setAttribute("aria-selected", a.dataset.tab === name ? "true" : "false")
  );
  ["overview", "leases", "payments", "rentroll", "balances", "whatsapp", "settings"].forEach(
    (id) => {
      const p = $(`#tab-${id}`);
      if (p) p.classList.toggle("hidden", id !== name);
    }
  );
  if (name === "overview") loadOverview().catch(console.error);
  if (name === "leases") loadLeases();
  if (name === "payments") loadPayments();
  if (name === "rentroll") loadRentroll();
  if (name === "balances") loadBalances().catch(console.error);
}
function wireTabs() {
  $$(".tab").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showTab(a.dataset.tab);
    })
  );
}


/* ============================== HEADER ============================== */
function setAPI(v) {
  state.api = (v || DEFAULT_API).trim().replace(/\/$/, "");
  localStorage.setItem("api_base", state.api);
  $("#apiBase") && ($("#apiBase").value = state.api);
  $("#apiBase2") && ($("#apiBase2").value = state.api);
}
function setAdminToken(v) {
  state.adminToken = v || "";
  localStorage.setItem("admin_token", state.adminToken);
  $("#adminToken") && ($("#adminToken").value = state.adminToken);
}

function setLastUpdated(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const now = new Date();
  el.textContent =
    "Last updated: " +
    now.toLocaleString("en-KE", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
}

function wireHeader() {
  $("#useApi")?.addEventListener("click", () => {
    setAPI($("#apiBase")?.value || DEFAULT_API);
    toast("API saved");
  });
  $("#openDocs")?.addEventListener("click", () =>
    window.open(`${state.api}/docs`, `_blank`)
  );
}

/* ============================= SETTINGS ============================= */
function wireSettings() {
  $("#saveSettings")?.addEventListener("click", () => {
    setAPI($("#apiBase2")?.value || DEFAULT_API);
    setAdminToken($("#adminToken")?.value || "");
    toast("Settings saved");
  });
  $("#resetSettings")?.addEventListener("click", () => {
    setAPI(DEFAULT_API);
    setAdminToken("");
    toast("Reset to defaults");
  });
}

/* ========================== INVOICE ACTIONS ========================= */
function wireActions() {
  if (!$("#actionMsg")) {
    const pre = document.createElement("pre");
    pre.id = "actionMsg";
    pre.style.whiteSpace = "pre-wrap";
    ($("#invoiceActions") || document.body).insertAdjacentElement(
      "afterend",
      pre
    );
  }
  // Single "Mark as sent"
  $("#btnMarkSent")?.addEventListener("click", async () => {
    const invoice_id = ($("#invoiceIdInput")?.value || "").trim();
    if (!invoice_id) return toast("Enter an invoice_id first");
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    $("#actionMsg").textContent = "Marking as sent…";
    try {
      const data = await jpost(
        "/invoices/mark_sent",
        { invoice_id },
        { admin: true }
      );
      $("#actionMsg").textContent = JSON.stringify(data, null, 2);
      toast("Stamped as sent");
    } catch (e) {
      $("#actionMsg").textContent = String(e);
      toast("Request failed");
    }
  });

  // Dunning buttons
  function ensure(afterSel, id, label) {
    if ($(id)) return $(id);
    const anchor = $(afterSel) || $("#invoiceActions") || document.body;
    const btn = document.createElement("button");
    btn.className = "btn ghost";
    btn.id = id.slice(1);
    btn.textContent = label;
    anchor.insertAdjacentElement("afterend", btn);
    return btn;
  }
  const bDry = ensure("#btnMarkSent", "#btnDunningDry", "Dunning (dry run)");
  const bApply = ensure("#btnDunningDry", "#btnDunningApply", "Dunning (apply)");
  const bLogR = ensure(
    "#btnDunningApply",
    "#btnDunningLogRecent",
    "Dunning log (recent)"
  );
  const bLogM = ensure(
    "#btnDunningLogRecent",
    "#btnDunningLogMonth",
    "Dunning log (this month)"
  );

  bDry?.addEventListener("click", () => callDunning(true));
  bApply?.addEventListener("click", () => {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    if (confirm("Apply late fees and log reminders now?"))
      callDunning(false);
  });
  bLogR?.addEventListener("click", () => loadDunningLog());
  bLogM?.addEventListener("click", () => loadDunningLog(yyyymm()));

  // Auth ping
  const authBtn =
    $("#btnHealth") ||
    Array.from(document.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim().toLowerCase() === "auth ping"
    );
  authBtn?.addEventListener("click", async () => {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    const out = $("#actionMsg");
    if (out) out.textContent = "Pinging…";
    try {
      const r = await fetch(`${state.api}/admin/ping`, {
        headers: {
          "X-Admin-Token": state.adminToken,
          Authorization: `Bearer ${state.adminToken}`,
        },
      });
      const data = await r.json().catch(() => ({}));
      if (out) out.textContent = JSON.stringify(data, null, 2);
      toast(r.ok ? "Admin auth OK" : `Unauthorized (${r.status})`);
    } catch (e) {
      if (out) out.textContent = String(e);
      toast("Ping failed");
    }
  });
}

/* =============================== DATA LOADERS =============================== */

/* ---- Overview KPIs & tile ---- */

async function loadOverview() {
  const month = getSelectedMonth();

  try {
    const [L_raw, P_raw, RR_raw, perTenant, OV] = await Promise.all([
  jget("/leases?limit=1000").catch(() => []),
  jget(`/payments?month=${encodeURIComponent(month)}`).catch(() => []),
  jget(`/rent-roll?month=${encodeURIComponent(month)}&limit=1000`).catch(() => []),
  fetchOutstandingRows(month).catch(() => []),
  fetchBalancesOverview(month).catch(() => null),
]);

// Normalise all the pieces we care about
const L  = apiArray(L_raw);   // leases
const P  = apiArray(P_raw);   // payments
const RR = apiArray(RR_raw);  // rent-roll


    // Total leases
    if ($("#kpiLeases")) {
      $("#kpiLeases").textContent = (L || []).length;
    }

    // Open invoices for that month (rows not fully paid)
    if ($("#kpiOpen")) {
      $("#kpiOpen").textContent = (RR || []).filter(
        (r) => String(r.status || "").toLowerCase() !== "paid"
      ).length;
    }

    // Payments KPI – prefer overview view, fall back to /payments
    if (OV && typeof OV.total_paid === "number") {
      if ($("#kpiPayments")) {
        $("#kpiPayments").textContent = OV.total_paid.toLocaleString("en-KE");
      }
    } else {
      const pSum = (P || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      if ($("#kpiPayments")) {
        $("#kpiPayments").textContent =
          pSum > 0 ? pSum.toLocaleString("en-KE") : (P || []).length;
      }
    }

    // Balance KPI – prefer overview view, fall back to per-tenant
    if (OV && typeof OV.total_outstanding === "number") {
      if ($("#kpiBalance")) {
        $("#kpiBalance").textContent = ksh(OV.total_outstanding);
      }
    } else {
      let balanceTotal = 0;
      if (Array.isArray(perTenant) && perTenant.length) {
        balanceTotal = perTenant.reduce(
          (s, r) => s + (Number(r.outstanding) || 0),
          0
        );
      } else {
        balanceTotal = (RR || []).reduce(
          (s, r) => s + (Number(r.balance ?? r.total_due) || 0),
          0
        );
      }
      if ($("#kpiBalance")) {
        $("#kpiBalance").textContent = ksh(balanceTotal);
      }
    }

    // Feed the “Outstanding by tenant” tile
    renderOutstanding(Array.isArray(perTenant) ? perTenant : []);
  } catch (e) {
    console.error(e);
    toast("Failed to load overview");
  }

  // Make sure the Monthly collection summary card stays in sync
  loadCollectionSummaryMonth().catch(console.error);
}


/* ---- Monthly collection summary row (Overview card) ---- */

async function loadCollectionSummaryMonth() {
  const month = getSelectedMonth(); // "YYYY-MM"

  try {
    // Get the same aggregated numbers used by the Overview cards
    const summary = await jget(
      `/dashboard/overview?month=${encodeURIComponent(month)}`
    );

    const labelEl = document.getElementById("summaryMonthLabel");
    const dueEl   = document.getElementById("summaryMonthDue");
    const paidEl  = document.getElementById("summaryMonthCollected");
    const balEl   = document.getElementById("summaryMonthBalance");
    const rateEl  = document.getElementById("summaryMonthRate");

    if (!labelEl || !dueEl || !paidEl || !balEl || !rateEl) return;

    // If API returned nothing sensible, just show the labels
    if (!summary || typeof summary !== "object") {
      labelEl.textContent = "";
      dueEl.textContent   = "due";
      paidEl.textContent  = "collected";
      balEl.textContent   = "balance";
      rateEl.textContent  = "collection rate";
      return;
    }

    const totalDue  = Number(summary.total_due || 0);
    const totalPaid = Number(summary.total_paid || 0);
    const totalBal  = Number(summary.balance_total || 0);

    // Use collection_rate_pct if provided, otherwise compute
    const rate =
      summary.collection_rate_pct != null
        ? Number(summary.collection_rate_pct)
        : totalDue > 0
        ? (totalPaid / totalDue) * 100
        : 0;

    // ---- Month label "Dec 2025" ----
    labelEl.textContent = fmtMonYearFromISO(`${month}-01`);

    // ---- Format with KES + words ----
    const withKes = (v) =>
      `KES ${v.toLocaleString("en-KE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    dueEl.textContent  = `${withKes(totalDue)} due`;
    paidEl.textContent = `${withKes(totalPaid)} collected`;
    balEl.textContent  = `${withKes(totalBal)} balance`;
    rateEl.textContent = `${rate.toFixed(1)}% collection rate`;
  } catch (err) {
    console.error("loadCollectionSummaryMonth failed", err);
  }
}


/* ---- Leases ---- */
async function loadLeases() {
  try {
    const rows = await jget("/leases?limit=1000");
    const q = ($("#leaseSearch")?.value || "").toLowerCase().trim();
    const filtered = q
      ? (rows || []).filter(
          (r) =>
            String(r.tenant || "").toLowerCase().includes(q) ||
            String(r.unit || "").toLowerCase().includes(q)
        )
      : rows || [];
    state.leasesView = filtered;
    $("#leasesCount") && ($("#leasesCount").textContent = filtered.length);
    $("#leasesEmpty")?.classList.toggle("hidden", filtered.length > 0);
    $("#leasesBody").innerHTML = filtered
      .map((r) => {
        const tenant = r.tenant ?? "—";
        const unit = r.unit ?? "—";
        const rent = r.rent_amount ?? r.rent ?? "—";
        const cycle = r.billing_cycle ?? r.cycle ?? "monthly";
        const dueDay = r.due_day ?? "—";
        const status = r.lease_status ?? r.status ?? "Active";
        const leaseId = r.lease_id || r.id || "";
        const waHref = leaseId
          ? `${state.api}/wa_for_lease_redirect?lease_id=${encodeURIComponent(
              leaseId
            )}`
          : null;
        return `<tr>
        <td>${tenant}</td>
        <td>${unit}</td>
        <td>${money(rent)}</td>
        <td>${cycle}</td>
        <td>${dueDay}</td>
        <td><span class="status ${
          String(status).toLowerCase() === "active" ? "ok" : "due"
        }">${status}</span></td>
        <td>${waHref ? `<a href="${waHref}" target="_blank">Open</a>` : "—"}</td>
      </tr>`;
      })
      .join("");
  } catch (e) {
    console.error(e);
    $("#leasesBody").innerHTML = "";
    $("#leasesEmpty")?.classList.remove("hidden");
  }
}
$("#reloadLeases")?.addEventListener("click", loadLeases);

/* --------- Payments --------- */
function ensurePaymentsMonthOptions() {
  const sel = $("#paymentsMonth");
  if (!sel || sel.options.length) return;
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement("option");
    opt.value = yyyymm(d);
    opt.textContent = d.toLocaleString("en-KE", {
      month: "short",
      year: "numeric",
    });
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensurePaymentsMonthOptions();

async function loadPayments() {
  try {
    const month = $("#paymentsMonth")?.value || yyyymm();
    const tQ = ($("#paymentsTenant")?.value || "").toLowerCase().trim();
    const sQ = $("#paymentsStatus")?.value || "";
    const rows = await jget(`/payments?month=${month}`);
    const filtered = (rows || []).filter((r) => {
      const okT = tQ
        ? String(r.tenant || "").toLowerCase().includes(tQ)
        : true;
      const okS = sQ ? String(r.status || "") === sQ : true;
      return okT && okS;
    });
    state.paymentsView = filtered;
    $("#paymentsCount") && ($("#paymentsCount").textContent = filtered.length);
    $("#paymentsEmpty")?.classList.toggle("hidden", filtered.length > 0);
    $("#paymentsBody").innerHTML = filtered
      .map(
        (r) => `
      <tr>
        <td>${
          r.paid_at || r.created_at
            ? new Date(r.paid_at || r.created_at).toLocaleDateString("en-KE")
            : "—"
        }</td>
        <td>${r.tenant ?? "—"}</td>
        <td>${r.method ?? "—"}</td>
        <td class="muted">${r.status ?? "posted"}</td>
        <td style="text-align:right">${money(r.amount)}</td>
      </tr>`
      )
      .join("");
    const total = filtered.reduce(
      (s, x) => s + (Number(x.amount) || 0),
      0
    );
    const trow = document.createElement("tr");
    trow.innerHTML = `<td colspan="4" style="text-align:right;font-weight:600">Total</td>
      <td style="text-align:right;font-weight:600">${money(total)}</td>`;
    $("#paymentsBody")?.appendChild(trow);
  } catch (e) {
    console.error(e);
    $("#paymentsBody").innerHTML = "";
    $("#paymentsEmpty")?.classList.remove("hidden");
  }
}
$("#applyPayments")?.addEventListener("click", loadPayments);
$("#clearPayments")?.addEventListener("click", () => {
  $("#paymentsTenant").value = "";
  $("#paymentsStatus").value = "";
  loadPayments();
});
$("#paymentsMonth")?.addEventListener("change", loadPayments);

/* --------- Rent Roll --------- */
function ensureRentrollMonthOptions() {
  const sel = $("#rentrollMonth");
  if (!sel || sel.options.length) return;
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement("option");
    opt.value = yyyymm(d);
    opt.textContent = d.toLocaleString("en-KE", {
      month: "short",
      year: "numeric",
    });
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}
ensureRentrollMonthOptions();

// --- Rent roll tab ---
async function loadRentroll() {
  try {
    const month = $("#rentrollMonth")?.value || yyyymm();
    const tQ = ($("#rentrollTenant")?.value || "").toLowerCase().trim();
    const pQ = ($("#rentrollProperty")?.value || "").toLowerCase().trim();

    const res  = await jget(`/rent-roll?month=${encodeURIComponent(month)}&limit=1000`);
    const rows = apiArray(res);

    const filtered = (rows || []).filter((r) => {
      const okTenant = tQ
        ? String(r.tenant || "").toLowerCase().includes(tQ)
        : true;
      const propName = String(r.property_name || r.property || "");
      const okProp = pQ ? propName.toLowerCase().includes(pQ) : true;
      return okTenant && okProp;
    });

    state.rentrollView = filtered;
    if ($("#rentrollCount")) {
      $("#rentrollCount").textContent = filtered.length;
    }

    const empty = $("#rentrollEmpty");
    empty?.classList.toggle("hidden", filtered.length > 0);

    $("#rentrollBody").innerHTML = filtered
      .map((r) => {
        const periodLabel =
          r.period ?? `${r.period_start || "—"} → ${r.period_end || "—"}`;

        const baseRent = Number(
          r.subtotal_rent ?? r.rent ?? r.total_due ?? 0
        );
        const lateFees = Number(r.late_fees ?? 0);
        const credits = Number(r.credits ?? 0);

        const totalDueRaw =
          r.total_due != null ? Number(r.total_due) : NaN;
        const totalDue = Number.isFinite(totalDueRaw)
          ? totalDueRaw
          : baseRent + lateFees - credits;

        const displayBalance = totalDue;

        return `
          <tr>
            <td>${r.property_name ?? r.property ?? "—"}</td>
            <td>${r.unit_code ?? r.unit ?? "—"}</td>
            <td>${r.tenant ?? "—"}</td>
            <td>${periodLabel}</td>
            <td>${money(baseRent)}</td>
            <td>${money(lateFees)}</td>
            <td class="status-cell">${r.status ?? "—"}</td>
            <td style="text-align:right">${money(displayBalance)}</td>
            <td>
              <button class="btn ghost" data-action="wa"
                      data-lease="${r.lease_id}">WhatsApp</button>
              <button class="btn ghost" data-action="mark"
                      data-lease="${r.lease_id}"
                      data-month="${month}">Mark sent</button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    $("#rentrollBody").innerHTML = "";
    $("#rentrollEmpty")?.classList.remove("hidden");
  }
}

$("#applyRentroll")?.addEventListener("click", loadRentroll);
$("#clearRentroll")?.addEventListener("click", () => {
  $("#rentrollTenant").value = "";
  $("#rentrollProperty").value = "";
  loadRentroll();
});

$("#rentrollBody")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action,
    leaseId = btn.dataset.lease,
    month = btn.dataset.month;

  if (action === "wa") {
    try {
      const ym = $("#rentrollMonth")?.value || yyyymm();
      const leaseKey = String(leaseId);

      const row = (state.rentrollView || []).find(
        (r) => String(r.lease_id ?? r.id ?? "") === leaseKey
      );

      const contact = await getContactForLease(leaseId);
      const phoneRaw = (contact?.phone || contact?.phone_e164 || "").trim();
      if (!phoneRaw) {
        toast("No phone number on file for this lease");
        return;
      }

      const ctx = {
        tenant_name:
          contact?.tenant ||
          row?.tenant ||
          row?.tenant_name ||
          "Tenant",
        unit: row?.unit_code || row?.unit || "Unit",
        period:
          row?.period ||
          fmtMonYearFromISO(row?.period_start || `${ym}-01`),
        rent: Number(row?.subtotal_rent ?? row?.rent ?? 0),
        late_fees: Number(row?.late_fees ?? 0),
        total_due: Number(row?.total_due ?? 0),
        paid_to_date: Number(row?.paid_amount ?? 0),
        amount_due: Number(row?.balance ?? row?.total_due ?? 0),
        due_date: row?.due_date
          ? new Date(row.due_date).toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "",
      };

      const url = buildWhatsAppURL(phoneRaw, ctx);
      if (!url) {
        toast("Could not build WhatsApp link");
        return;
      }
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to open WhatsApp for rent roll row", err);
      toast("Failed to open WhatsApp");
    }
    return;
  }

  if (action === "mark") {
    if (!state.adminToken) return toast("Set Admin token in Settings first");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "…";
    try {
      const invoiceId = await getInvoiceIdForLeaseMonth(leaseId, month);
      if (!invoiceId) {
        toast("No invoice found for that lease/month");
        return;
      }
      const res = await jpost(
        "/invoices/mark_sent",
        { invoice_id: invoiceId },
        { admin: true }
      );
      btn
        .closest("tr")
        ?.querySelector(".status-cell")
        ?.replaceChildren(
          document.createTextNode(res?.invoice?.status || "sent")
        );
      toast("Marked sent");
    } catch (e) {
      toast(`Failed: ${e.message || e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
});

/* ---- Balances helpers & tab --------- */

function canonicalTenantName(raw) {
  const clean = String(raw || "").trim();
  const lower = clean.toLowerCase();

  // Fix known misspelling from bank / form data
  if (lower === "everlyne achieng'" || lower === "everlyne achieng") {
    return "Evelyne Achieng";
  }

  return clean;
}

/* ---- Balances tab: totals card + main table ---- */

async function loadBalances() {
  const month = state.month || yyyymm(); // fallback to current month

  /* ---------- 1) Totals card (This month totals) ---------- */
  try {
    const summary = await jget(
      `/balances/overview?month=${encodeURIComponent(month)}`
    );

    const labelEl =
      document.getElementById("balMonthLabel") ||
      document.getElementById("balancesMonthLabel");
    const dueEl =
      document.getElementById("balMonthDue") ||
      document.getElementById("balancesDue");
    const paidEl =
      document.getElementById("balMonthCollected") ||
      document.getElementById("balancesPaid");
    const balEl =
      document.getElementById("balMonthBalance") ||
      document.getElementById("balancesOutstanding");
    const rateEl =
      document.getElementById("balMonthRate") ||
      document.getElementById("balancesRate");

    if (labelEl && dueEl && paidEl && balEl && rateEl) {
      if (!summary || typeof summary !== "object") {
        // Fallback if API fails
        labelEl.textContent = "–";
        dueEl.textContent = "KES 0 due";
        paidEl.textContent = "KES 0 collected";
        balEl.textContent = "KES 0 balance";
        rateEl.textContent = "0.0% collection rate";
      } else {
        const totalDue = Number(summary.total_due || 0);
        const totalPaid = Number(summary.total_paid || 0);
        const totalBal = Number(summary.balance_total || 0);

        const rate =
          summary.collection_rate_pct != null
            ? Number(summary.collection_rate_pct)
            : totalDue > 0
            ? (totalPaid / totalDue) * 100
            : 0;

        // e.g. "Dec 2025"
        labelEl.textContent = fmtMonYearFromISO(`${month}-01`);

        const withKes = (v) =>
          `KES ${Number(v || 0).toLocaleString("en-KE", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`;

        dueEl.textContent = `${withKes(totalDue)} due`;
        paidEl.textContent = `${withKes(totalPaid)} collected`;
        balEl.textContent = `${withKes(totalBal)} balance`;
        rateEl.textContent = `${rate.toFixed(1)}% collection rate`;
      }
    }
  } catch (err) {
    console.error("loadBalances(): totals card failed", err);
  }

  /* ---------- 2) Per-tenant “Balances (This Month)” table ---------- */
  const tbody = document.getElementById("balancesBody");
  const empty = document.getElementById("balancesEmpty");
  const monthLabel =
    document.getElementById("balancesMonthLabel") ||
    document.getElementById("balMonthLabel");

  if (!tbody) return;

  if (monthLabel) {
    monthLabel.textContent = fmtMonYearFromISO(`${month}-01`);
  }

  tbody.innerHTML =
    '<tr><td colspan="5" class="empty">Loading balances…</td></tr>';

  try {
    const rows = await jget(
      `/metrics/monthly_tenant_payment_reconciliation?month=${encodeURIComponent(
        month
      )}`
    );

    if (!Array.isArray(rows) || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty">No balances to show yet.</td></tr>';
      if (empty) empty.classList.add("hidden");
      setLastUpdated("balancesLastUpdated");
      return;
    }

    const withKesPlain = (v) =>
      `KES ${Number(v || 0).toLocaleString("en-KE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

    const html = rows
      .sort((a, b) => (a.tenant || "").localeCompare(b.tenant || ""))
      .map((r) => {
        const due = Number(r.rent_due || 0);
        const paid = Number(r.paid || 0);

        // SQL already gives us cumulative, non-negative balance
        const bal =
          r.balance_in_month != null
            ? Number(r.balance_in_month)
            : Math.max(0, due - paid);

        const rate =
          r.collection_rate_pct != null
            ? Number(r.collection_rate_pct)
            : due > 0
            ? (paid / due) * 100
            : 0;

        return `
          <tr>
            <td>${r.tenant || "—"}</td>
            <td class="num">${withKesPlain(due)}</td>
            <td class="num">${withKesPlain(paid)}</td>
            <td class="num">${withKesPlain(bal)}</td>
            <td class="num">${rate.toFixed(1)}%</td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = html;
    if (empty) empty.classList.toggle("hidden", rows.length > 0);
    setLastUpdated("balancesLastUpdated");
  } catch (err) {
    console.error("loadBalances(): table failed", err);
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty">Failed to load balances.</td></tr>';
    if (empty) empty.classList.add("hidden");
  }
}


/* ============================ EXPORTS ============================ */
function ensureExportButtons() {
  // Any button with data-export-endpoint + optional data-export-prefix
  const buttons = document.querySelectorAll("[data-export-endpoint]");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    const endpoint = btn.getAttribute("data-export-endpoint");
    const prefix   = btn.getAttribute("data-export-prefix") || "export";

    btn.addEventListener("click", async () => {
      try {
        const month = getSelectedMonth();
        const url = `${state.api}${endpoint}?month=${encodeURIComponent(
          month
        )}`;

        const headers = {};
        if (state.adminToken) headers["X-Admin-Token"] = state.adminToken;

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);

        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${prefix}-${month}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        console.error(err);
        toast("Failed to export CSV");
      }
    });
  });
}

ensureExportButtons();


/* ================================ BOOT ================================ */
(function init() {
  // Restore API + admin token from local storage
  setAPI(state.api);
  setAdminToken(state.adminToken);

  // Footer year
  const yy = $("#yy");
  if (yy) yy.textContent = new Date().getFullYear();

  // Wire up UI behaviour (tabs, header buttons, auth ping, etc.)
  wireTabs();
  wireHeader();
  wireSettings();
  wireActions(); // <- this is what makes "Auth ping" clickable

  // Month picker default (YYYY-MM, current month) if empty
  const mp = document.getElementById("monthPicker");
  if (mp && !mp.value) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    mp.value = `${now.getFullYear()}-${mm}`;
  }

  // When month is changed, reload all month-sensitive data
  if (mp) {
    mp.addEventListener("change", () => {
      loadCollectionSummaryMonth().catch(console.error);
      loadOverview().catch(console.error);
      loadBalances().catch(console.error);
      loadOutstandingByTenant().catch(console.error);
    });
  }

  // ---------------- Balances tab reload ----------------
  const btnBalReload = document.getElementById("reloadBalances");
  if (btnBalReload) {
    btnBalReload.addEventListener("click", () => {
      loadBalances().catch(console.error);
    });
  }

    // Balances CSV export button
  const btnExportBalances = document.getElementById("btnExportBalances");
  if (btnExportBalances) {
    btnExportBalances.addEventListener("click", () => {
      exportBalancesCsv().catch(console.error);
    });
  }

  // ---------------- Outstanding-by-tenant reload ----------------
  // Support either id, depending on what exists in index.html
  // "Outstanding by tenant (this month)" reload
  ["#reloadOutstandingByTenant", "#reloadOutstanding"].forEach((sel) => {
    const btn = $(sel);
    if (!btn) return;
    btn.addEventListener("click", () => {
      loadOutstandingByTenant().catch(console.error);
    });
  });

  // ---------------- Initial loads ----------------
  loadOverview().catch(console.error);
  loadBalances().catch(console.error);
  loadOutstandingByTenant().catch(console.error);

  // Start on Overview tab
  showTab("overview");
})();
